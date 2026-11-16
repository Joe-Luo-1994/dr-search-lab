import {chromium} from 'playwright';
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const out='evidence/c-restart-20261116/report-browser';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true});const checks=[],errors=[];let failure;
try{
 const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(path.resolve('docs/C_RESTART_RESULT_20261116.html')).href);
 for(const width of [320,390,1280]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('width-'+width);}
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:out+'/mobile.png'});
 for(const detail of await p.locator('details').all()){await detail.locator('summary').click();assert(await detail.evaluate(e=>e.open));}checks.push('all-details');
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('expanded-mobile');
 for(const href of await p.locator('a[href]').evaluateAll(xs=>xs.map(x=>x.getAttribute('href'))))if(!/^https?:/.test(href))assert(fs.existsSync(path.resolve('docs',href)),href);
 checks.push('evidence-links');assert.deepEqual(errors,[]);checks.push('no-page-errors');
}catch(e){failure={message:e.message};}finally{await b.close();fs.writeFileSync(out+'/result.json',JSON.stringify({passed:!failure,checks,errors,failure,scope:'agent report inspection, not user acceptance or load'},null,2));}
console.log(JSON.stringify({passed:!failure,checks,failure}));if(failure)process.exitCode=1;

