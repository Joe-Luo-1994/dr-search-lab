import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const out='evidence/c-query-cost-20261116/report-browser';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true}),checks=[],errors=[];let failure;
try{
 const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(path.resolve('docs/C_QUERY_COST_RESULT_20261116.html')).href);
 for(const width of [320,390,1280]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:out+'/overview-'+width+'.png'});checks.push('width-'+width);}
 await p.setViewportSize({width:390,height:844});assert.equal(await p.locator('#queries .card').count(),9);checks.push('nine-query-cards');
 const card=p.locator('#queries .card').nth(4);await card.locator('summary').click();assert((await card.innerText()).includes('TEMP B-TREE'));await card.screenshot({path:out+'/tags-detail-mobile.png'});checks.push('plan-disclosure');
 for(const href of await p.locator('a[href]').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')).filter(x=>!x.startsWith('#')&&!/^https?:/.test(x))))assert(fs.existsSync(path.resolve('docs',href)),href);
 checks.push('local-evidence-links');assert.deepEqual(errors,[]);checks.push('no-page-errors');
}catch(e){failure={message:e.message,stack:e.stack};}
finally{await b.close();fs.writeFileSync(out+'/result.json',JSON.stringify({passed:!failure,checks,errors,failure,scope:'agent layout/evidence inspection, not user acceptance or benchmark'},null,2),{flag:'wx'});}
console.log(JSON.stringify({passed:!failure,checks,failure}));if(failure)process.exitCode=1;
