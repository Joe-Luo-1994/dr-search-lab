import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const root=process.cwd(),dir='scripts/v1-e2-20261115',runtime='.lab/v1-e2-20261115',out='evidence/v1-e2-20261115';
const oracle=JSON.parse(fs.readFileSync(dir+'/review/oracle.json'));
const prepared=JSON.parse(fs.readFileSync(out+'/preparation.json'));
const frozen=JSON.parse(fs.readFileSync(out+'/freeze.json'));
const e1=JSON.parse(fs.readFileSync('evidence/v1-e1-20261115/freeze-r2.json'));
const hash=b=>createHash('sha256').update(b).digest('hex'),exec=promisify(execFile);
const save=(name,value)=>fs.writeFileSync(out+'/'+name,JSON.stringify(value,null,2),{flag:'wx'});
const journal=(name,value)=>fs.appendFileSync(out+'/'+name,JSON.stringify(value)+'\n');
const children=[],checks=[],pageErrors=[],started=performance.now();let browser,failed,timer,requestNumber=0;
const origin='http://127.0.0.1:3160';
function verify(){for(const f of [e1.files,frozen.files])for(const [p,h] of Object.entries(f))assert.equal(hash(fs.readFileSync(p)),h,p);}
function diskBytes(p){if(!fs.existsSync(p))return 0;return fs.readdirSync(p,{withFileTypes:true}).reduce((n,e)=>n+(e.isDirectory()?diskBytes(p+'/'+e.name):fs.statSync(p+'/'+e.name).size),0);}
async function resource(stage){
 const {stdout}=await exec('pwsh.exe',['-NoProfile','-File','scripts/v1-e1-20261115/monitor.ps1'],{windowsHide:true,timeout:10000});
 const m=JSON.parse(stdout),ids=new Set([process.pid,...children.map(c=>c.pid)]);
 for(let i=0;i<10;i++)for(const p of m.processes)if(ids.has(p.ParentProcessId))ids.add(p.ProcessId);
 const rss=m.processes.filter(p=>ids.has(p.ProcessId)).reduce((n,p)=>n+Number(p.WorkingSetSize),0),bytes=diskBytes(runtime)+diskBytes(out);
 journal('resources.jsonl',{stage,at:new Date().toISOString(),freeMemoryBytes:m.freeMemoryBytes,freeDiskBytes:m.freeDiskBytes,rss,logicalBytes:bytes});
 assert(m.freeMemoryBytes>=2*1024**3,'FREE_RAM');assert(m.freeDiskBytes>=10*1024**3,'FREE_DISK');assert(bytes<512*1024**2,'SIZE_GUARD');assert(rss<6*1024**3,'RSS_GUARD');
}
async function command(label,file,args=[],expected=0){
 const t=performance.now();let stdout='',stderr='',code=0;
 try{({stdout,stderr}=await exec(process.execPath,[dir+'/'+file,...args],{windowsHide:true,timeout:60000,maxBuffer:1048576}));}
 catch(e){stdout=e.stdout??'';stderr=e.stderr??'';code=e.code;}
 const row={label,file,args,code,stdout,stderr,elapsedMs:performance.now()-t};journal('commands.jsonl',row);assert.equal(code,expected,label);return row;
}
async function start(label,file,args,readyEvent){
 const stdout=fs.openSync(out+'/'+label+'.stdout.log','wx'),stderr=fs.openSync(out+'/'+label+'.stderr.log','wx');
 const child=spawn(process.execPath,[dir+'/'+file,...args],{windowsHide:true,stdio:['ignore','pipe',stderr]});children.push(child);fs.closeSync(stderr);
 let accumulated='';child.stdout.on('data',b=>{fs.writeSync(stdout,b);accumulated+=b.toString();});
 child.once('exit',()=>fs.closeSync(stdout));
 const began=performance.now();
 while(!accumulated.includes('"event":"'+readyEvent+'"')){
  if(child.exitCode!==null)throw Error('SERVICE_EXIT '+label);
  if(performance.now()-began>15000)throw Error('SERVICE_READY_TIMEOUT '+label);
  await new Promise(r=>setTimeout(r,50));
 }
 journal('lifecycle.jsonl',{label,pid:child.pid,args,ready:accumulated,elapsedMs:performance.now()-began});return child;
}
async function request(label,url,identity='a',status=200,version){
 assert(url.startsWith('/')&&!url.startsWith('//'),'RELATIVE_LINK');
 const id=++requestNumber,began=performance.now();
 const response=await fetch(origin+url,{headers:{'x-e1-identity':identity},signal:AbortSignal.timeout(5000)});
 const bytes=Buffer.from(await response.arrayBuffer()),elapsedMs=performance.now()-began;
 const isJson=response.headers.get('content-type')?.includes('json'),body=isJson?JSON.parse(bytes):null;
 const record={id,label,url,identity,status:response.status,headers:Object.fromEntries(response.headers),elapsedMs,bytes:bytes.length,sha256:hash(bytes),body};
 if(!isJson){record.file=`downloads/${id}.pdf`;fs.writeFileSync(out+'/'+record.file,bytes,{flag:'wx'});}
 journal('requests.jsonl',record);assert.equal(response.status,status,label);assert.equal(response.headers.get('cache-control'),'no-store');assert(elapsedMs<5000);
 if(version&&isJson){assert.equal(body.snapshotId,oracle.snapshotIds[version]);assert.equal(body.snapshotCapturedAt,oracle.capturedAt[version]);}
 if(status>=400)assert.deepEqual(Object.keys(body),['error']);return {body,record,bytes};
}
const versionUrl=(p,v)=>p+'?version='+encodeURIComponent(oracle.snapshotIds[v]);
async function queries(version){
 for(const q of oracle.queryExpectations){const params=new URLSearchParams({q:q.q});for(const t of q.tagIds??[])params.append('tagId',t);
  const {body}=await request(version+'-'+q.id,'/api/search?'+params,q.identity,200,version);
  assert.equal(body.total,q[version].total);assert.deepEqual(body.hits.map(x=>x.pageId).sort(),[...q[version].requiredPageIds].sort());
  for(const hit of body.hits)assert.equal(new URL(hit.url,origin).searchParams.get('version'),oracle.snapshotIds[version]);
 }
}
async function chain(version,label){
 const {body:search}=await request(label+'-search','/api/search?q=e2packet','a',200,version);
 assert.equal(search.total,1);const hit=search.hits[0];assert.equal(hit.pageId,'a-pdf');
 const {body:page}=await request(label+'-page',hit.url,'a',200,version);
 const expected=oracle.contentExpectations['a-pdf'][version];
 const base=JSON.parse(fs.readFileSync('scripts/v1-e1-20261115/fixture/source.json'));
 const body=version==='v1'?[...base.pages.find(p=>p.pageId==='a-pdf').paragraphs,oracle.sourceRecipe.v1.appendParagraph['a-pdf']].join('\n'):expected.body;
 assert.equal(page.page.body,body);assert.equal(page.page.spaceId,'space-a');
 const {body:media}=await request(label+'-media',page.page.mediaUrl,'a',200,version);
 assert.deepEqual(media.media.map(x=>x.mediaId),expected.mediaIds);
 const pdf=await request(label+'-download',media.media[0].url);
 assert.equal(pdf.record.sha256,expected.mediaSha256);assert.equal(pdf.bytes.length,expected.mediaBytes);assert.equal(pdf.record.headers['x-e2-snapshot-id'],oracle.snapshotIds[version]);
 return {pageUrl:hit.url,mediaUrl:page.page.mediaUrl,downloadUrl:media.media[0].url};
}
async function error(label,url,identity,status,code){const r=await request(label,url,identity,status);assert.equal(r.body.error.code,code);}
async function portFree(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
try{
 assert(!fs.existsSync(out+'/result.json'),'EXISTING_FORMAL_RESULT');verify();
 fs.mkdirSync(out+'/downloads');for(const p of [3158,3159,3160,3161])await portFree(p);
 timer=setTimeout(()=>{failed??={message:'E2_180S_WATCHDOG'};browser?.close();for(const c of children)c.kill();},180000);
 await resource('before');
 await command('install-v1','install.mjs',['v1','main',prepared.v1.manifestSha256]);
 await start('reader-v1','serve.mjs',['v1','3158','main'],'e2_ready');
 await command('route-v1','traffic.mjs',['set','3158']);await start('traffic','traffic.mjs',['serve'],'e2-traffic-ready');
 await queries('v1');const oldLinks=await chain('v1','v1');save('v1-links.json',oldLinks);
 browser=await chromium.launch({channel:'msedge',headless:true,timeout:15000});
 const page=await browser.newPage({viewport:{width:375,height:812},acceptDownloads:true});page.setDefaultTimeout(5000);page.on('pageerror',e=>pageErrors.push(e.message));
 await page.goto(origin,{waitUntil:'networkidle',timeout:10000});
 await page.getByLabel('搜尋頁面或 PDF 文字',{exact:true}).fill('e2packet');
 const [oldUiResponse]=await Promise.all([page.waitForResponse(r=>r.url().includes('/api/search?')),page.getByRole('button',{name:'搜尋',exact:true}).click()]);
 assert.equal((await oldUiResponse.json()).snapshotId,oracle.snapshotIds.v1);await page.locator('#result-a-pdf').waitFor();
 checks.push({id:'G1-v1',passed:true});await resource('G1');
 const stablePaths=[runtime+'/traffic.json',runtime+'/caches/main/last-success.json',runtime+'/caches/main/v1/manifest.json'];
 const stable=Object.fromEntries(stablePaths.map(p=>[p,hash(fs.readFileSync(p))]));
 const mixed=await command('reject-mixed','install.mjs',['mixed-v2','main',prepared['mixed-v2'].manifestSha256],1);
 assert(mixed.stdout.includes('e2_staged_hashes_verified'));assert(mixed.stderr.includes('SQLITE_IDENTITY_MISMATCH'));
 for(const [p,h] of Object.entries(stable))assert.equal(hash(fs.readFileSync(p)),h,p);assert(!fs.existsSync(runtime+'/caches/main/v2'));
 const {body:status}=await request('failed-update-status','/api/status','a',200,'v1');assert.equal(status.latestAttempt.code,'SQLITE_IDENTITY_MISMATCH');assert.equal(status.lastSuccessfulInstallation.snapshotId,oracle.snapshotIds.v1);
 await chain('v1','v1-after-rejection');save('bad-update-preservation.json',{stable,status});checks.push({id:'G2-mixed-rejected',passed:true});await resource('G2');
 await command('install-v2','install.mjs',['v2','main',prepared.v2.manifestSha256]);await start('reader-v2','serve.mjs',['v2','3159','main'],'e2_ready');
 await command('route-v2','traffic.mjs',['set','3159']);await queries('v2');
 for(const [kind,url] of Object.entries(oldLinks))await error('stale-'+kind,url,'a',409,'VERSION_MISMATCH');
 await error('missing-version','/api/pages/a-pdf','a',400,'VERSION_REQUIRED');
 await error('unknown-not-version-bypass',oldLinks.pageUrl,'unknown',503,'AUTHORIZATION_UNKNOWN');
 await error('moved-page-a',versionUrl('/api/pages/a-move','v2'),'a',404,'NOT_FOUND');
 const moved=await request('moved-page-b',versionUrl('/api/pages/a-move','v2'),'b',200,'v2');assert.equal(moved.body.page.spaceId,'space-b');
 await error('removed-media',versionUrl('/api/pages/a-pdf/media/pdf-checklist','v2'),'a',404,'NOT_FOUND');
 // Synthetic client reconstructs links from a new search only after an explicit old-link failure.
 const newLinks=await chain('v2','client-recovery');save('client-recovery.json',{oldLinks,newLinks,method:'409 then explicit new search and returned URLs; no silent token stripping'});
 const webStarted=performance.now();
 await page.locator('#result-a-pdf').click();const alert=page.locator('main').getByRole('alert');await alert.waitFor();
 assert((await alert.textContent()).includes('資料版本已更新'));assert.equal(await page.locator('article').count(),0);assert.equal(await page.locator('.result-link').count(),0);
 await page.screenshot({path:out+'/web-stale-mobile.png',fullPage:true});
 const [newUiResponse]=await Promise.all([page.waitForResponse(r=>r.url().includes('/api/search?')),page.getByRole('button',{name:'重新搜尋',exact:true}).click()]);
 assert.equal((await newUiResponse.json()).snapshotId,oracle.snapshotIds.v2);await page.locator('#result-a-pdf').click();await page.locator('article h2').waitFor();
 assert((await page.locator('article').textContent()).includes(oracle.contentExpectations['a-pdf'].v2.body.split('\n')[0]));
 await page.getByRole('button',{name:'載入 deployment-checklist-v2.pdf',exact:true}).click();await page.getByRole('link',{name:'下載 PDF',exact:true}).waitFor();
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'下載 PDF',exact:true}).click()]);const file=await download.path();const pdf=fs.readFileSync(file);
 assert.equal(hash(pdf),oracle.contentExpectations['a-pdf'].v2.mediaSha256);assert.equal(await page.locator('main').getByRole('alert').count(),0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/web-recovered-mobile.png',fullPage:true});assert(performance.now()-webStarted<30000);assert.equal(pageErrors.length,0);
 save('web-recovery.json',{from:oracle.snapshotIds.v1,to:oracle.snapshotIds.v2,pdfSha256:hash(pdf),elapsedMs:performance.now()-webStarted,pageErrors});
 checks.push({id:'G3-v2-client-web-recovery',passed:true});await resource('G3');
}catch(e){failed??={message:e.message,stack:e.stack};}
finally{
 clearTimeout(timer);if(browser)await browser.close();
 for(const child of children.reverse()){if(child.exitCode===null){child.kill();await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,5000);});}}
 try{verify();assert.equal(fs.readFileSync(runtime+'/role-profile.txt','utf8'),'baseline\n');}catch(e){failed??={message:e.message};}
 save('result.json',{at:new Date().toISOString(),elapsedMs:performance.now()-started,checks,requests:requestNumber,pageErrors,failed,passed:!failed&&checks.length===3,scope:'G1-G3 only; G4 independent operator pending',childPids:children.map(c=>c.pid)});
 console.log(JSON.stringify({checks:checks.length,requests:requestNumber,passed:!failed&&checks.length===3,failed}));if(failed)process.exitCode=1;
}
