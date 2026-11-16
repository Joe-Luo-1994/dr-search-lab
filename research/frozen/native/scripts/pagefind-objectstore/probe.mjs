// Native, isolated MinIO experiment. Never uses existing Lab data, env files or services.
import { buildDemo } from '../pagefind/demo.mjs';
import { Client } from 'minio';
import { chromium } from 'playwright';
import { spawn, fork, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const out=path.resolve(process.argv[2]||'.lab/reports/pagefind-objectstore');
await mkdir(out,{recursive:true});
const report={at:new Date().toISOString(),pagefind:'1.6.0',sdk:'8.0.7',synthetic:true,scope:'Native MinIO + fresh Node web processes + Chromium; not Kubernetes/Next integration or production auth',checks:[],phases:[],objects:[],attempts:[],limitations:['Loopback HTTP; production TLS/CSP not exercised','Browser corpus disclosure and real ReBAC not solved','No release promotion, MinIO failure recovery, scale or consumer API acceptance']};
let minio,web,browser,client,root,minioLog='';
const accessKey='probe-'+randomBytes(8).toString('hex'),secretKey=randomBytes(24).toString('hex');
const redact=s=>String(s).replaceAll(accessKey,'[ephemeral-user]').replaceAll(secretKey,'[ephemeral-secret]');
function check(name,fn){try{fn();report.checks.push({name,passed:true})}catch(e){report.checks.push({name,passed:false,error:redact(e.message)});throw e}}
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function stop(p){if(!p||p.exitCode!==null||p.signalCode!==null)return;const done=once(p,'exit');p.kill('SIGTERM');const timer=setTimeout(()=>p.kill('SIGKILL'),5000);await done;clearTimeout(timer);}
async function bytes(stream){const chunks=[];for await(const b of stream)chunks.push(b);return Buffer.concat(chunks);}
async function walk(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);files.push(...e.isDirectory()?await walk(p):[p]);}return files;}
const webScript=fileURLToPath(new URL('./web.mjs',import.meta.url));
async function startWeb(mode,endpoint,bucket,webPort=0){
 const cwd=await mkdtemp(path.join(root,'empty-web-'));
 const p=fork(webScript,[],{cwd,stdio:['ignore','pipe','pipe','ipc'],env:{PATH:process.env.PATH,PROBE_MINIO_URL:endpoint,PROBE_BUCKET:bucket,PROBE_MODE:mode,PROBE_WEB_PORT:String(webPort),MINIO_ROOT_USER:accessKey,MINIO_ROOT_PASSWORD:secretKey}});
 let log='';p.stderr.on('data',b=>{log+=b});
 const ready=await Promise.race([once(p,'message').then(([m])=>m),once(p,'exit').then(([code])=>{throw Error(`Web startup failed ${code}: ${redact(log)}`)})]);
 return {process:p,cwd,url:`http://127.0.0.1:${ready.port}`,port:ready.port,pid:ready.pid,mode};
}
async function phase(name,server,expectedOrigin){
 const context=await browser.newContext();const page=await context.newPage();const requests=[],errors=[];
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url);await page.waitForFunction(()=>typeof window.searchBundle==='function',null,{timeout:15000});
 const cases=[['chinese','資料庫備份',{space:'ops'}],['tags','backup',{space:'ops',tags:['database','runbook']}],['code','ERR_CONN_RESET',{space:'ops'}],['attachment','quartzfalcon',{space:'ops'}]];
 const queries=[];
 for(const [name,term,filters] of cases){const result=await page.evaluate(({term,filters})=>Promise.race([window.searchBundle(term,filters),new Promise(resolve=>setTimeout(()=>resolve({ok:false,error:'query timeout 15000ms'}),15000))]),{term,filters});queries.push({name,...result});}
 report.phases.push({name,pid:server.pid,mode:server.mode,queries,requests,errors,webDirectory:await readdir(server.cwd),metrics:await(await fetch(server.url+'/metrics')).json()});
 const q=n=>queries.find(x=>x.name===n);
 check(name+': Chinese retrieves p01/p02/p07',()=>assert(q('chinese').ok&&['p01','p02','p07'].every(id=>q('chinese').ids.includes(id))));
 check(name+': tags AND returns 17 and p01',()=>assert(q('tags').ok&&q('tags').total===17&&q('tags').ids.includes('p01')));
 check(name+': code and extracted attachment',()=>assert(q('code').ids.includes('p05')&&q('attachment').ids.includes('p06')));
 check(name+': all bundle requests use expected origin',()=>{const bundle=requests.filter(u=>u.includes('/pagefind/')||u.includes('/assets/'));assert(bundle.length>2);assert(bundle.every(u=>new URL(u).origin===expectedOrigin));});
 check(name+': web working directory remains empty',()=>assert.deepEqual(report.phases.at(-1).webDirectory,[]));
 check(name+': result URLs stay on web origin',()=>assert(q('chinese').urls.every(u=>new URL(u,server.url).origin===new URL(server.url).origin)));
 check(name+': no page errors',()=>assert.deepEqual(errors,[]));
 await context.close();
}
try{
 if(!process.env.MINIO_BINARY)throw Error('Set MINIO_BINARY to a verified local MinIO executable; no implicit download.');
 report.minioVersion=execFileSync(process.env.MINIO_BINARY,['--version'],{encoding:'utf8'}).trim();
 await mkdir('.lab/pagefind-objectstore',{recursive:true});root=await mkdtemp(path.resolve('.lab/pagefind-objectstore/run-'));await mkdir(path.join(root,'data'));
 const minioPort=await port(),endpoint=`http://127.0.0.1:${minioPort}`,bucket='pagefind-synthetic';
 minio=spawn(process.env.MINIO_BINARY,['server',path.join(root,'data'),'--address',`127.0.0.1:${minioPort}`,'--quiet'],{stdio:['ignore','pipe','pipe'],env:{...process.env,MINIO_ROOT_USER:accessKey,MINIO_ROOT_PASSWORD:secretKey,MINIO_BROWSER:'off',MINIO_API_CORS_ALLOW_ORIGIN:'*'}});
 minio.stdout.on('data',b=>{minioLog+=b});minio.stderr.on('data',b=>{minioLog+=b});
 let ready=false;
 for(let i=0;i<120;i++){if(minio.exitCode!==null)throw Error('MinIO exited before ready: '+redact(minioLog));try{if((await fetch(endpoint+'/minio/health/ready',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 check('real MinIO ready',()=>assert(ready));
 client=new Client({endPoint:'127.0.0.1',port:minioPort,useSSL:false,accessKey,secretKey});await client.makeBucket(bucket,'us-east-1');
 const built=await buildDemo(),bundle=path.join(built.root,'pagefind');
 for(const file of await walk(bundle)){
  const rel=path.relative(bundle,file).split(path.sep).join('/'),b=await readFile(file),key='releases/r1/pagefind/'+rel;
  const type=rel.endsWith('.js')?'text/javascript':rel.endsWith('.css')?'text/css':rel.endsWith('.json')?'application/json':'application/octet-stream';
  await client.putObject(bucket,key,b,b.length,{'Content-Type':type,'Cache-Control':'no-store'});
  report.objects.push({key,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),contentType:type});
 }
 let matches=0;for(const object of report.objects){const b=await bytes(await client.getObject(bucket,object.key));if(createHash('sha256').update(b).digest('hex')!==object.sha256)throw Error('Uploaded object mismatch '+object.key);matches++;}
 check('all MinIO object bytes match generated bundle',()=>assert.equal(matches,report.objects.length));
 await rename(bundle,path.join(built.root,'producer-archive-not-served'));
 const originalPathAbsent=!(await readdir(built.root)).includes('pagefind');
 check('original local serving path no longer exists',()=>assert(originalPathAbsent));
 const policy={Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{AWS:['*']},Action:['s3:GetObject'],Resource:[`arn:aws:s3:::${bucket}/releases/r1/pagefind/*`]}]};
 await client.setBucketPolicy(bucket,JSON.stringify(policy));
 browser=await chromium.launch({headless:true});
 web=await startWeb('direct',endpoint,bucket);const firstPid=web.pid,firstPort=web.port;
 const headers=await fetch(`${endpoint}/${bucket}/releases/r1/pagefind/pagefind.js`,{headers:{Origin:web.url}});
 report.directHeaders={status:headers.status,contentType:headers.headers.get('content-type'),allowOrigin:headers.headers.get('access-control-allow-origin')};
 await phase('direct-cross-origin',web,endpoint);
 const localBundleStatus=(await fetch(web.url+'/pagefind/pagefind.js')).status;
 check('web local bundle route is absent',()=>assert.equal(localBundleStatus,404));
 await stop(web.process);web=await startWeb('direct',endpoint,bucket,firstPort);
 check('web was replaced by a new process',()=>assert.notEqual(web.pid,firstPid));
 await phase('after-web-restart-fresh-browser',web,endpoint);
 await client.setBucketPolicy(bucket,'');
 const denied=await fetch(`${endpoint}/${bucket}/releases/r1/pagefind/pagefind.js`);report.privateDirectStatus=denied.status;
 check('private MinIO rejects direct unauthenticated GET',()=>assert.equal(denied.status,403));
 await stop(web.process);web=await startWeb('proxy',endpoint,bucket);
 await phase('private-bucket-streaming-proxy',web,new URL(web.url).origin);
 check('private proxy reads real objects',()=>assert(report.phases.at(-1).metrics.objectsRead>2));
 report.passed=true;
}catch(e){report.passed=false;report.failure=redact(e.stack);process.exitCode=1;}
finally{
 await browser?.close();await stop(web?.process);await stop(minio);
 report.finishedAt=new Date().toISOString();report.cleanedUpOwnProcesses=true;
 await writeFile(path.join(out,'minio-process.log'),redact(minioLog));
 await writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,objects:report.objects.length,phases:report.phases.map(p=>({name:p.name,queries:p.queries.map(({name,ok,total})=>({name,ok,total}))})),failure:report.failure},null,2));
}
