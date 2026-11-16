import fs from 'node:fs';
import fsp from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';

const out='evidence/v1-e1-followup-20261115',origin='http://127.0.0.1:3157';
const role='.lab/v1-e1-20261115/prepared/role-profile.txt';
const hash=x=>createHash('sha256').update(x).digest('hex');
const save=(name,data)=>fs.writeFileSync(out+'/'+name,JSON.stringify(data,null,2),{flag:'wx'});
const journal=(name,data)=>fs.appendFileSync(out+'/'+name,JSON.stringify(data)+'\n');
const freeze=JSON.parse(fs.readFileSync('evidence/v1-e1-20261115/freeze-r2.json'));
const stamp=()=>({now:Date.now(),iso:new Date().toISOString(),monotonic:performance.now(),hrtime:process.hrtime.bigint().toString()});
function verify(){for(const [name,sha] of Object.entries(freeze.files))assert.equal(hash(fs.readFileSync(name)),sha,name);return Object.keys(freeze.files).length;}
const started=stamp(), checks=[],errors=[],responses=[];let browser,timer,failure;
assert(!fs.existsSync(out+'/result.json'),'EXISTING_RUN');
assert.equal(fs.readFileSync(role,'utf8'),'baseline\n');
save('followup-freeze.json',{at:new Date().toISOString(),originalFilesVerified:verify(),files:Object.fromEntries(['docs/DR_E1_FOLLOWUP_CARD_20261115.md',...fs.readdirSync('scripts/v1-e1-followup-20261115').map(x=>'scripts/v1-e1-followup-20261115/'+x)].map(x=>[x,hash(fs.readFileSync(x))]))});
const exec=promisify(execFile);
function diskBytes(dir){return fs.readdirSync(dir,{withFileTypes:true}).reduce((n,x)=>n+(x.isDirectory()?diskBytes(dir+'/'+x.name):fs.statSync(dir+'/'+x.name).size),0);}
async function resources(stage){
 const {stdout}=await exec('pwsh.exe',['-NoProfile','-File','scripts/v1-e1-20261115/monitor.ps1'],{windowsHide:true,timeout:10000});
 const data=JSON.parse(stdout);const bytes=diskBytes(out);
 journal('resources.jsonl',{stage,at:new Date().toISOString(),freeMemoryBytes:data.freeMemoryBytes,freeDiskBytes:data.freeDiskBytes,evidenceBytes:bytes});
 assert(data.freeMemoryBytes>=2*1024**3);assert(data.freeDiskBytes>=10*1024**3);assert(bytes<50*1024**2);
}
async function profile(value){await fsp.writeFile(role+'.next',value+'\n');await fsp.rename(role+'.next',role);journal('profile.jsonl',{value,at:stamp()});}
async function api(stage,path){
 const id=`${stage}-${path.includes('search')?'search':'page'}`,before=stamp();
 const response=await fetch(origin+path,{headers:{'x-e1-identity':'b','x-followup-id':id},signal:AbortSignal.timeout(5000)});
 const body=await response.json(),after=stamp(),auth=Date.parse(body.authorizationCheckedAt);
 const record={id,path,before,after,status:response.status,headers:Object.fromEntries(response.headers),body,elapsedMs:after.monotonic-before.monotonic,wallContained:Number.isFinite(auth)?auth>=before.now&&auth<=after.now:null};
 journal('api.jsonl',record);
 assert.equal(response.headers.get('cache-control'),'no-store');assert(record.elapsedMs<5000);
 const revoked=stage==='revoked-b',isSearch=path.includes('search');
 assert.equal(response.status,revoked&&!isSearch?404:200);
 if(response.status===200){assert(Number.isFinite(auth));assert.equal(body.snapshotId,'v1-e1-20261115-snapshot1');}
 if(isSearch){assert.equal(body.total,revoked?0:1);assert.deepEqual(body.hits.map(x=>x.pageId),revoked?[]:['b-roles']);}
 else if(revoked)assert.equal(body.error.code,'NOT_FOUND');else assert.equal(body.page.pageId,'b-roles');
 checks.push({id,passed:true});
}
try{
 timer=setTimeout(()=>{browser?.close();console.error('FOLLOWUP_WATCHDOG');process.exitCode=1;},180000);
 await resources('before');
 for(const stage of ['baseline','revoked-b','restored']){await profile(stage==='revoked-b'?'revoked-b':'baseline');await api(stage,'/api/pages/b-roles');await api(stage,'/api/search?q=Quartz');}
 browser=await chromium.launch({channel:'msedge',headless:true,timeout:15000});
 const page=await browser.newPage({viewport:{width:375,height:812}});page.setDefaultTimeout(5000);
 page.on('pageerror',x=>errors.push(x.message));
 page.on('response',r=>{if(r.url().includes('/api/'))responses.push({url:r.url(),status:r.status(),identity:r.request().headers()['x-e1-identity']});});
 await page.goto(origin,{waitUntil:'networkidle',timeout:10000});
 const identity=page.getByRole('combobox',{name:'研究身份',exact:true});
 assert.equal(await identity.count(),1);
 const clear=async()=>{assert.equal(await page.locator('article').count(),0);assert.equal(await page.locator('#results').count(),0);assert.equal(await page.locator('.result-link').count(),0);};
 const search=async()=>{await page.getByLabel('搜尋頁面或 PDF 文字',{exact:true}).fill('relay');await page.getByRole('button',{name:'搜尋',exact:true}).click();await page.locator('#results').waitFor();};
 await search();await page.locator('#result-a-relay').click();await page.locator('article h2').waitFor();
 await identity.selectOption('none');await clear();checks.push({id:'identity-clears-open-page-and-results',passed:true});
 await search();assert.equal(await page.locator('#results').textContent(),'沒有符合的頁面');assert.equal(await page.locator('.result-link').count(),0);checks.push({id:'none-empty',passed:true});
 await identity.selectOption('unknown');await clear();
 await page.getByRole('button',{name:'搜尋',exact:true}).click();await page.getByRole('alert').waitFor();
 assert((await page.getByRole('alert').textContent()).includes('無法確認存取權限'));await clear();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/unknown-mobile.png',fullPage:true});checks.push({id:'unknown-not-empty-result',passed:true});
 await page.setViewportSize({width:1280,height:900});await identity.selectOption('a');
 assert.equal(await page.getByRole('alert').count(),0);await search();assert.equal(await page.locator('.result-link').count(),10);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/desktop.png',fullPage:true});checks.push({id:'PUBLIC-HOST',passed:true});
 await identity.selectOption('none');await clear();checks.push({id:'identity-clears-PUBLIC-HOST',passed:true});
 await identity.selectOption('a');
 let readyResolve,releaseResolve,doneResolve;
 const ready=new Promise(r=>readyResolve=r),release=new Promise(r=>releaseResolve=r),done=new Promise(r=>doneResolve=r);
 const delay={};
 await page.route('**/api/search?*',async route=>{
   try{const response=await route.fetch({timeout:5000});const body=await response.json();delay.status=response.status();delay.pageIds=body.hits.map(x=>x.pageId);readyResolve();await release;await route.fulfill({response});delay.fulfilled=true;}
   catch(e){delay.routeError=e.message;readyResolve();}finally{doneResolve();}
 });
 await page.getByRole('button',{name:'搜尋',exact:true}).click();
 await Promise.race([ready,new Promise((_,r)=>setTimeout(()=>r(Error('DELAY_READY_TIMEOUT')),6000))]);
 assert.equal(delay.status,200);assert.equal(delay.pageIds.length,10);
 await identity.selectOption('none');await clear();releaseResolve();await done;
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await clear();
 assert.equal(await identity.inputValue(),'none');assert.equal(await page.getByRole('alert').count(),0);
 save('delayed-response.json',delay);checks.push({id:'late-old-identity-response-not-rendered',passed:true});
 await page.unrouteAll({behavior:'wait'});assert.equal(errors.length,0);
 await resources('after');
}catch(e){failure={message:e.message,stack:e.stack};}
finally{
 clearTimeout(timer);if(browser)await browser.close();await profile('baseline');
 let preservation;try{preservation={originalFilesVerified:verify(),role:fs.readFileSync(role,'utf8')};}catch(e){failure??={message:e.message};}
 save('result.json',{started,ended:stamp(),node:process.version,checks,pageErrors:errors,uiResponses:responses,failure,preservation,passed:!failure&&checks.length===12});
 console.log(JSON.stringify({checks:checks.length,passed:!failure&&checks.length===12,failure}));
 if(failure)process.exitCode=1;
}
