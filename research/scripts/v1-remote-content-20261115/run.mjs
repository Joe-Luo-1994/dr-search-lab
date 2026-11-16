import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {s3} from './s3.mjs';

const root=process.cwd(),dir='scripts/v1-remote-content-20261115',rt='.lab/v1-remote-content-20261115',out='evidence/v1-remote-content-20261115';
const oracle=JSON.parse(fs.readFileSync(dir+'/review/oracle.json')), frozen=JSON.parse(fs.readFileSync(out+'/freeze.json'));
const hash=b=>createHash('sha256').update(b).digest('hex'), exec=promisify(execFile);
const children=[],checks=[],pageErrors=[],started=performance.now();
let browser,page,failed,requestCount=0,minioDown=false;
const abort=new AbortController();
const origin='http://127.0.0.1:3164';
process.env.REMOTE_CONFIG_PATH=path.resolve(rt,'private-config.json');
process.env.REMOTE_IO_LOG=path.resolve(out,'remote-io.jsonl');
const save=(file,data)=>fs.writeFileSync(out+'/'+file,JSON.stringify(data,null,2),{flag:'wx'});
const journal=(file,data)=>fs.appendFileSync(out+'/'+file,JSON.stringify(data)+'\n');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function verify(){for(const [p,h]of Object.entries(frozen.files))assert.equal(hash(fs.readFileSync(p)),h,p);}
function io(){return fs.existsSync(process.env.REMOTE_IO_LOG)?fs.readFileSync(process.env.REMOTE_IO_LOG,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];}
function stop(message){failed??={message};abort.abort(Error(message));browser?.close().catch(()=>{});for(const c of children)c.kill();}
function ensure(){abort.signal.throwIfAborted();}
function bytesUnder(p){return !fs.existsSync(p)?0:fs.readdirSync(p,{withFileTypes:true}).reduce((n,e)=>n+(e.isDirectory()?bytesUnder(p+'/'+e.name):fs.statSync(p+'/'+e.name).size),0);}
async function minio(action,{cleanup=false}={}){
 if(!cleanup)ensure();
 const began=performance.now();
 const {stdout}=await exec('wsl.exe',['-d','Ubuntu','--','python3','/PUBLIC/WINDOWS_WORKSPACE/'+dir+'/minio-service.py',action],{windowsHide:true,timeout:15000,...(cleanup?{}:{signal:abort.signal})});
 const result=JSON.parse(stdout);journal('lifecycle.jsonl',{kind:'minio',action,...result,elapsedMs:performance.now()-began});if(!cleanup)ensure();return result;
}
async function health(want){
 const began=performance.now();let ok=false;
 do{ensure();try{ok=(await fetch('http://127.0.0.1:19440/minio/health/live',{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(600)])})).ok;}catch{ok=false;}
 ensure();if(ok===want)return;await wait(100);}while(performance.now()-began<10000);
 throw Error('MINIO_HEALTH_EXPECTED_'+want);
}
async function resource(stage){
 ensure();const {stdout}=await exec('pwsh.exe',['-NoProfile','-File','scripts/v1-e1-20261115/monitor.ps1'],{windowsHide:true,timeout:10000,signal:abort.signal});ensure();
 const m=JSON.parse(stdout),ids=new Set([process.pid,...children.map(c=>c.pid)]);
 for(let i=0;i<10;i++)for(const p of m.processes)if(ids.has(p.ParentProcessId))ids.add(p.ProcessId);
 const windowsRss=m.processes.filter(p=>ids.has(p.ProcessId)).reduce((n,p)=>n+Number(p.WorkingSetSize),0);
 const linux=await minio('status'),logicalBytes=bytesUnder(rt)+bytesUnder(out);
 journal('resources.jsonl',{stage,at:new Date().toISOString(),windowsWorkingSetBytes:windowsRss,minioRss:linux.rss,logicalBytes,freeMemoryBytes:m.freeMemoryBytes,freeDiskBytes:m.freeDiskBytes});
 assert(m.freeMemoryBytes>=2*1024**3,'FREE_RAM');assert(m.freeDiskBytes>=10*1024**3,'FREE_DISK');assert(logicalBytes<512*1024**2,'DISK_GUARD');assert(windowsRss+linux.rss<6*1024**3,'RSS_GUARD');
}
async function command(label,file,args,expected=0){
 ensure();let stdout='',stderr='',code=0;const began=performance.now();
 try{({stdout,stderr}=await exec(process.execPath,[dir+'/'+file,...args],{windowsHide:true,timeout:30000,signal:abort.signal,maxBuffer:2**20}));}
 catch(e){stdout=e.stdout??'';stderr=e.stderr??'';code=e.code;}
 const row={label,args,code,stdout,stderr,elapsedMs:performance.now()-began};journal('commands.jsonl',row);ensure();assert.equal(code,expected,label);return row;
}
async function start(label,file,args,ready){
 ensure();
 const log=fs.openSync(out+'/'+label+'.stdout.log','wx'),err=fs.openSync(out+'/'+label+'.stderr.log','wx');
 const child=spawn(process.execPath,[dir+'/'+file,...args],{windowsHide:true,stdio:['ignore','pipe',err]});children.push(child);fs.closeSync(err);
 let text='';child.stdout.on('data',b=>{fs.writeSync(log,b);text+=b;});child.once('exit',()=>fs.closeSync(log));
 const began=performance.now();while(!text.includes('"event":"'+ready+'"')){ensure();if(child.exitCode!==null)throw Error('START_EXIT_'+label);if(performance.now()-began>15000)throw Error('START_TIMEOUT_'+label);await wait(50);}
 ensure();journal('lifecycle.jsonl',{kind:'next',label,pid:child.pid,args,ready:text,elapsedMs:performance.now()-began});return child;
}
async function request(label,url,identity='a',status=200,base=origin){
 ensure();assert(url.startsWith('/')&&!url.startsWith('//'));const began=performance.now();
 const response=await fetch(base+url,{headers:{'x-e1-identity':identity},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)])});
 const bytes=Buffer.from(await response.arrayBuffer()),elapsedMs=performance.now()-began;
 const body=response.headers.get('content-type')?.includes('json')?JSON.parse(bytes):null;
 const row={id:++requestCount,label,base,url,identity,status:response.status,elapsedMs,headers:Object.fromEntries(response.headers),bytes:bytes.length,sha256:hash(bytes),body};
 if(!body){row.file='downloads/'+requestCount+'.pdf';fs.writeFileSync(out+'/'+row.file,bytes,{flag:'wx'});}
 journal('requests.jsonl',row);ensure();assert.equal(response.status,status,label);assert.equal(response.headers.get('cache-control'),'no-store');assert(elapsedMs<5000);
 if(status>=400)assert.deepEqual(Object.keys(body),['error']);return {body,bytes,row};
}
async function error(label,url,identity,status,code,base){const r=await request(label,url,identity,status,base);assert.equal(r.body.error.code,code);return r;}
const vurl=(p,v)=>p+'?version='+oracle.snapshotIds[v];
const pageRef=(v,id)=>oracle.referenceContent[v].pages.find(p=>p.pageId===id);
const mediaRef=(v,id)=>oracle.referenceContent[v].media.find(p=>p.mediaId===id);
function envelope(body,v){assert.equal(body.snapshotId,oracle.snapshotIds[v]);assert.equal(body.snapshotCapturedAt,oracle.snapshotCapturedAt[v]);assert(Number.isFinite(Date.parse(body.authorizationCheckedAt)));}
async function linked(v,label,links,identity='a',base=origin,id='a-pdf'){
 const ref=pageRef(v,id);
 const {body:p}=await request(label+'-page',links.pageUrl,identity,200,base);envelope(p,v);
 for(const k of ['pageId','spaceId','title','tagIds'])assert.deepEqual(p.page[k],ref[k]);assert.equal(p.page.body,ref.body);
 if(links.mediaUrl)assert.equal(p.page.mediaUrl,links.mediaUrl);
 const {body:m}=await request(label+'-media',p.page.mediaUrl,identity,200,base);envelope(m,v);assert.equal(m.pageId,id);assert.deepEqual(m.media.map(x=>x.mediaId),ref.mediaIds);
 for(const media of m.media){const expected=mediaRef(v,media.mediaId);for(const k of ['fileName','mimeType','sha256','bytes'])assert.equal(media[k],expected[k]);}
 const media=m.media[0],expected=mediaRef(v,media.mediaId);if(links.downloadUrl)assert.equal(media.url,links.downloadUrl);
 const {bytes,row}=await request(label+'-pdf',media.url,identity,200,base);assert.equal(hash(bytes),expected.sha256);assert.equal(bytes.length,expected.bytes);assert.equal(row.headers['x-e2-snapshot-id'],oracle.snapshotIds[v]);assert.equal(row.headers['content-type'],expected.mimeType);
 return {pageUrl:links.pageUrl,mediaUrl:p.page.mediaUrl,downloadUrl:media.url};
}
async function chain(v,label,{id='a-pdf',q='e2packet',identity='a',base=origin}={}){
 const {body:s}=await request(label+'-search','/api/search?q='+encodeURIComponent(q),identity,200,base);
 assert.equal(s.total,1);assert.deepEqual(s.hits.map(h=>h.pageId),[id]);envelope(s,v);
 const ref=pageRef(v,id),hit=s.hits[0];assert.equal(hit.title,ref.title);assert.equal(hit.spaceId,ref.spaceId);assert.deepEqual(hit.tagIds,ref.tagIds);
 const before=io().length;
 const links=await linked(v,label,{pageUrl:hit.url},identity,base,id);
 const remote=io().slice(before).filter(r=>r.method==='GET'&&r.status===200);
 assert(remote.some(r=>r.key.includes('/pages/'+id+'/')));assert(remote.some(r=>r.key.includes('/media/'+ref.mediaIds[0]+'/')));
 return links;
}
async function check(id,fn){ensure();const began=performance.now(),ioStart=io().length;await fn();ensure();checks.push({id,passed:true,elapsedMs:performance.now()-began,ioStart,ioEnd:io().length});}
async function noReads(fn){const before=io().length;await fn();assert.equal(io().length,before,'Denied/local path must not fetch objects');}
async function screenshot(name){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/'+name+'.png',fullPage:true});}
async function webTask(fn){const t=setTimeout(()=>stop('WEB_TASK_30S'),30000);try{await fn();}finally{clearTimeout(t);}}
async function downloadUi(){await page.getByRole('button',{name:'載入 deployment-checklist-v2.pdf',exact:true}).click();const link=page.getByRole('link',{name:'下載 PDF',exact:true});await link.waitFor();const [d]=await Promise.all([page.waitForEvent('download'),link.click()]);const b=fs.readFileSync(await d.path());assert.equal(hash(b),mediaRef('v2','pdf-checklist-v2').sha256);}
async function portFree(port){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});}
function auditCaches(){
 const inventory=[];
 for(const [cache,v,variant]of [['main','v1','v1'],['main','v2','v2'],['negative','v2','wrong-v2']]){
  const directory=rt+'/caches/'+cache+'/'+v;
  if(!fs.existsSync(directory))continue;
  assert.deepEqual(fs.readdirSync(directory).sort(),['manifest.json','receipt.json','search-text.json','search.sqlite']);
  for(const f of ['manifest.json','search-text.json','search.sqlite']){
   const bytes=fs.readFileSync(directory+'/'+f);assert.equal(hash(bytes),hash(fs.readFileSync(rt+'/artifacts/'+variant+'/'+f)));
   inventory.push({cache,version:v,file:f,bytes:bytes.length,sha256:hash(bytes)});
  }
  const manifest=JSON.parse(fs.readFileSync(directory+'/manifest.json'));assert(manifest.pages.every(p=>!('body'in p)));assert(!fs.readdirSync(directory).some(f=>f.endsWith('.pdf')));
 }
 return inventory;
}
const timer=setTimeout(()=>stop('FORMAL_300S'),300000);
try{
 verify();for(const p of [3162,3163,3164,3165,3166])assert(await portFree(p),'PORT_BUSY_'+p);await resource('preflight');await health(true);
 fs.mkdirSync(out+'/downloads');
 await command('install-v1','publish-install.mjs',['install','v1','v1','main']);
 await start('v1','serve.mjs',['v1','3162','main'],'remote_content_ready');
 await command('route-v1','traffic.mjs',['set','3162']);await start('proxy','traffic.mjs',['serve'],'e2-traffic-ready');
 let oldLinks,newLinks,bLinks;
 await check('R1-01',async()=>{oldLinks=await chain('v1','v1');});
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});ensure();
 page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});page.setDefaultTimeout(5000);
 page.on('pageerror',e=>pageErrors.push(e.message));
 await webTask(async()=>{await page.goto(origin);await page.locator('#q').fill('e2packet');await page.getByRole('button',{name:'搜尋',exact:true}).click();await page.locator('#result-a-pdf').waitFor();});
 await check('R1-02',async()=>{
  await command('install-negative','publish-install.mjs',['install','wrong-v2','v2','negative']);await start('wrong-v2','serve.mjs',['v2','3165','negative'],'remote_content_ready');
  const before=io().length;await error('wrong-body',vurl('/api/pages/a-pdf','v2'),'a',503,'CONTENT_INTEGRITY_MISMATCH','http://127.0.0.1:3165');
  const rows=io().slice(before);assert.equal(rows.length,1);assert.equal(rows[0].status,200);assert.equal(rows[0].responseBytes,pageRef('v2','a-pdf').objectBytes);
  const near=pageRef('v2','a-pdf-near');assert.equal(rows[0].key,oracle.snapshotIds.v2+'/pages/a-pdf-near/'+near.objectSha256+'.json');assert.equal(rows[0].responseSha256,near.objectSha256);
 });
 await check('R1-04',async()=>{await command('install-v2','publish-install.mjs',['install','v2','v2','main']);await start('v2','serve.mjs',['v2','3163','main'],'remote_content_ready');await command('route-v2','traffic.mjs',['set','3163']);newLinks=await chain('v2','v2');});
 await check('R1-05',()=>noReads(async()=>{for(const url of Object.values(oldLinks))await error('old-link',url,'a',409,'VERSION_MISMATCH');}));
 await check('R1-06',async()=>{const before=io().length;await linked('v1','retained-v1',oldLinks,'a','http://127.0.0.1:3162');assert.equal(io().slice(before).filter(r=>r.method==='GET'&&r.status===200).length,2);});
 await check('R1-07',()=>webTask(async()=>{
  await page.locator('#result-a-pdf').click();const alert=page.locator('main').getByRole('alert');await alert.waitFor();assert((await alert.textContent()).includes('資料版本已更新'));assert.equal(await page.locator('article').count(),0);await screenshot('web-version-mismatch');
  await page.getByRole('button',{name:'重新搜尋',exact:true}).click();await page.locator('#result-a-pdf').click();await page.locator('article h2').waitFor();assert((await page.locator('.body-copy').textContent()).includes(pageRef('v2','a-pdf').paragraphs[0]));await downloadUi();await screenshot('web-v2-remote');
 }));await resource('R1');
 await check('R2-01',async()=>{bLinks=await chain('v2','b-authorized',{id:'b-export',q:'Falcon',identity:'b'});});
 for(const id of ['R2-02','R2-03'])await check(id,()=>noReads(async()=>{const c=oracle.cases.find(c=>c.id===id);for(const r of c.requests??[c.request])await error(id,r.path,r.identity,404,'NOT_FOUND');}));
 await check('R2-04',async()=>{
  fs.writeFileSync(rt+'/role-profile.txt','revoked-b\n');try{await noReads(async()=>{for(const url of Object.values(bLinks))await error('revoked',url,'b',404,'NOT_FOUND');});}finally{fs.writeFileSync(rt+'/role-profile.txt','baseline\n');}
  await chain('v2','role-restored',{id:'b-export',q:'Falcon',identity:'b'});
 });
 await check('R2-05',()=>noReads(async()=>{for(const r of oracle.cases.find(c=>c.id==='R2-05').requests)await error('unknown',r.path,r.identity,503,'AUTHORIZATION_UNKNOWN');}));
 const manifest=JSON.parse(fs.readFileSync(rt+'/caches/main/v2/manifest.json'));
 await check('R2-06',async()=>{for(const d of [manifest.pages.find(p=>p.pageId==='a-pdf').bodyObject,manifest.media.find(m=>m.mediaId==='pdf-checklist-v2')]){
  ensure();const response=await s3('GET',d.key,{anonymous:true,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)])});ensure();journal('anonymous.jsonl',{key:d.key,status:response.status,body:response.bytes.toString()});assert.equal(response.status,403);assert(response.bytes.toString().includes('<Code>AccessDenied</Code>'));assert.notEqual(hash(response.bytes),d.sha256);
 }});await resource('R2');
 // One actual dependency outage, retaining the same Next readers and local files.
 const halted=await minio('stop');assert.equal(halted.live,false);minioDown=true;await health(false);
 await check('R3-01',()=>noReads(async()=>{for(const r of oracle.cases.find(c=>c.id==='R3-01').requests){const {body}=await request('offline-local',r.path,r.identity);if(r.expect.requiredPageIds){assert.equal(body.total,r.expect.total);assert.deepEqual(body.hits.map(h=>h.pageId),r.expect.requiredPageIds);}else assert.deepEqual(body.media.map(m=>m.mediaId),r.expect.mediaIds);}}));
 await check('R3-02',async()=>{await error('offline-body',newLinks.pageUrl,'a',503,'CONTENT_UNAVAILABLE');await error('offline-pdf',newLinks.downloadUrl,'a',503,'MEDIA_UNAVAILABLE');});
 await check('R3-03',async()=>{
  const install=await command('empty-offline-install','publish-install.mjs',['install','v2','v2','fresh'],1);assert(install.stderr.includes('ARTIFACT_UNAVAILABLE'));assert(!fs.existsSync(rt+'/caches/fresh/v2'));assert(!fs.existsSync(rt+'/caches/fresh/last-success.json'));
  const start=await command('empty-reader-not-ready','serve.mjs',['v2','3166','fresh'],1);assert(start.stderr.includes('ENOENT'));assert(start.stderr.replaceAll('\\','/').includes('/caches/fresh/v2'));assert(!start.stderr.includes('Usage:'));assert(!start.stdout.includes('remote_content_ready'));assert(await portFree(3166));
 });
 await check('R3-04',async()=>{
  await webTask(async()=>{await page.reload();await page.locator('#q').fill('e2packet');await page.getByRole('button',{name:'搜尋',exact:true}).click();await page.locator('#result-a-pdf').click();await page.getByRole('button',{name:'重試載入頁面',exact:true}).waitFor();assert((await page.locator('main').getByRole('alert').textContent()).includes('目前無法讀取頁面正文'));assert.equal(await page.locator('article').count(),0);await screenshot('web-content-unavailable');});
  await minio('start');await health(true);minioDown=false;
  await webTask(async()=>{await page.getByRole('button',{name:'重試載入頁面',exact:true}).click();await page.locator('article h2').waitFor();assert((await page.locator('.body-copy').textContent()).includes(pageRef('v2','a-pdf').paragraphs[0]));await downloadUi();await screenshot('web-content-restored');});
 });
 await check('R3-05',async()=>{await chain('v2','restored');verify();});await resource('R3');
 assert.deepEqual(checks.map(c=>c.id),oracle.executionOrder);assert.deepEqual(pageErrors,[]);
}catch(e){failed??={message:e.message,stack:e.stack};}
finally{
 clearTimeout(timer);if(browser)await browser.close().catch(()=>{});
 for(const c of children.reverse())if(c.exitCode===null){c.kill();await Promise.race([new Promise(r=>c.once('exit',r)),wait(4000)]);}
 fs.writeFileSync(rt+'/role-profile.txt','baseline\n');
 let cleanup;
 try{cleanup=await minio('stop',{cleanup:true});assert(!cleanup.live);verify();save('cache-audit.json',auditCaches());for(const p of [3162,3163,3164,3165,3166])assert(await portFree(p),'CLEANUP_PORT_'+p);}catch(e){failed??={message:'CLEANUP: '+e.message};}
 save('result.json',{at:new Date().toISOString(),elapsedMs:performance.now()-started,passed:!failed&&checks.length===oracle.executionOrder.length,checks,requests:requestCount,pageErrors,failed,minioWasDownAtFinally:minioDown,cleanup,childPids:children.map(c=>c.pid)});
 console.log(JSON.stringify({passed:!failed,checks:checks.length,requests:requestCount,failed}));if(failed)process.exitCode=1;
}
