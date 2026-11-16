import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const out='evidence/v1-e1-followup-20261115',origin='http://127.0.0.1:3157';
const save=(name,value)=>fs.writeFileSync(out+'/'+name,JSON.stringify(value,null,2),{flag:'wx'});
const hash=x=>createHash('sha256').update(x).digest('hex');
const freeze=JSON.parse(fs.readFileSync('evidence/v1-e1-20261115/freeze-r2.json'));
function verify(){for(const [p,h] of Object.entries(freeze.files))assert.equal(hash(fs.readFileSync(p)),h,p);return Object.keys(freeze.files).length;}
assert(!fs.existsSync(out+'/ui-continuation.json'));
save('ui-continuation-freeze.json',{at:new Date().toISOString(),originalFilesVerified:verify(),scriptSha256:hash(fs.readFileSync(new URL(import.meta.url))),cardSha256:hash(fs.readFileSync('docs/DR_E1_UI_CONTINUATION_CARD_20261115.md'))});
const checks=[],errors=[],network=[],started=performance.now();let browser,failure,alertsBefore,alertsAfter;
const deadline=setTimeout(()=>{browser?.close();process.exitCode=1;},60000);
try{
 browser=await chromium.launch({channel:'msedge',headless:true,timeout:15000});
 const page=await browser.newPage({viewport:{width:375,height:812}});page.setDefaultTimeout(5000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>network.push({event:'failed',url:r.url(),identity:r.headers()['x-e1-identity'],failure:r.failure()}));
 page.on('response',r=>{if(r.url().includes('/api/'))network.push({event:'response',url:r.url(),identity:r.request().headers()['x-e1-identity'],status:r.status()});});
 await page.goto(origin,{waitUntil:'networkidle',timeout:10000});
 const alertSnapshot=()=>page.getByRole('alert',{includeHidden:true}).evaluateAll(xs=>xs.map(x=>({html:x.outerHTML,text:x.textContent,inMain:!!x.closest('main'),visible:x.checkVisibility(),bounds:x.getBoundingClientRect().toJSON(),rootHost:x.getRootNode().host?.outerHTML})));
 alertsBefore=await alertSnapshot();save('alerts-before.json',alertsBefore);
 const identity=page.getByRole('combobox',{name:'研究身份',exact:true});assert.equal(await identity.count(),1);
 const productAlert=page.locator('main').getByRole('alert');
 const clear=async()=>{assert.equal(await page.locator('article').count(),0);assert.equal(await page.locator('#results').count(),0);assert.equal(await page.locator('.result-link').count(),0);};
 await identity.selectOption('unknown');await page.getByLabel('搜尋頁面或 PDF 文字',{exact:true}).fill('relay');
 const [response]=await Promise.all([page.waitForResponse(r=>r.url().includes('/api/search?')&&r.request().headers()['x-e1-identity']==='unknown'),page.getByRole('button',{name:'搜尋',exact:true}).click()]);
 const body=await response.json();assert.equal(response.status(),503);assert.equal(body.error.code,'AUTHORIZATION_UNKNOWN');
 await productAlert.waitFor();assert((await productAlert.textContent()).includes('無法確認存取權限'));await clear();
 alertsAfter=await alertSnapshot();save('alerts-after.json',alertsAfter);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/unknown-mobile.png',fullPage:true});checks.push({id:'unknown-not-empty-result',passed:true,status:response.status(),body});
 await page.setViewportSize({width:1280,height:900});await identity.selectOption('a');assert.equal(await productAlert.count(),0);
 await page.getByRole('button',{name:'搜尋',exact:true}).click();await page.locator('#results').waitFor();
 assert.equal(await page.locator('.result-link').count(),10);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/desktop.png',fullPage:true});checks.push({id:'PUBLIC-HOST',passed:true});
 await identity.selectOption('none');await clear();checks.push({id:'identity-clears-PUBLIC-HOST',passed:true});
 await identity.selectOption('a');let readyResolve,releaseResolve,doneResolve;
 const ready=new Promise(r=>readyResolve=r),release=new Promise(r=>releaseResolve=r),done=new Promise(r=>doneResolve=r),delay={events:[]};
 await page.route('**/api/search?*',async route=>{
   try{const response=await route.fetch({timeout:5000});const body=await response.json();delay.status=response.status();delay.pageIds=body.hits.map(x=>x.pageId);delay.events.push('old-a-server-response-obtained');readyResolve();await release;await route.fulfill({response});delay.events.push('route-fulfill-completed');}
   catch(e){delay.routeError=e.message;delay.events.push('route-error');readyResolve();}finally{doneResolve();}
 });
 await page.getByRole('button',{name:'搜尋',exact:true}).click();
 let readyTimer;try{await Promise.race([ready,new Promise((_,r)=>readyTimer=setTimeout(()=>r(Error('DELAY_READY_TIMEOUT')),6000))]);}finally{clearTimeout(readyTimer);}
 assert.equal(delay.status,200);assert.equal(delay.pageIds.length,10);
 await identity.selectOption('none');delay.events.push('identity-none-selected');await clear();releaseResolve();await done;
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await clear();
 assert.equal(await identity.inputValue(),'none');assert.equal(await productAlert.count(),0);
 delay.events.push('none-still-clear-after-route-completion');save('delayed-response-continuation.json',delay);
 checks.push({id:'late-old-identity-response-not-rendered',passed:true});await page.unrouteAll({behavior:'wait'});assert.equal(errors.length,0);
}catch(e){failure={message:e.message,stack:e.stack};}
finally{
 clearTimeout(deadline);if(browser)await browser.close();let preserved;
 try{preserved=verify();assert.equal(fs.readFileSync('.lab/v1-e1-20261115/prepared/role-profile.txt','utf8'),'baseline\n');}catch(e){failure??={message:e.message};}
 save('ui-continuation.json',{at:new Date().toISOString(),elapsedMs:performance.now()-started,checks,pageErrors:errors,network,alertsBefore,alertsAfter,originalFilesVerified:preserved,passed:!failure&&checks.length===4,failure});
 console.log(JSON.stringify({checks:checks.length,passed:!failure&&checks.length===4,failure}));if(failure)process.exitCode=1;
}
