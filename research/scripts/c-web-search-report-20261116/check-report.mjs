import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const out='evidence/c-web-search-20261116/report-browser';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true}),checks=[],errors=[];let failure;
try{
 const page=await b.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.resolve('docs/C_WEB_SEARCH_RESULT_20261116.html')).href);
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/overview-'+width+'.png'});checks.push('width-'+width);}
 await page.setViewportSize({width:390,height:844});await page.locator('#tasks details').last().locator('summary').click();assert((await page.locator('#tasks details').last().innerText()).includes('restricted-tags'));checks.push('query-details');
 await page.locator('#tasks .card').last().screenshot({path:out+'/last-stage-mobile.png'});
 for(const href of await page.locator('a[href]').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')).filter(x=>!x.startsWith('#'))))assert(fs.existsSync(path.resolve('docs',href)),href);
 checks.push('evidence-links');assert.deepEqual(errors,[]);checks.push('no-page-errors');
}catch(e){failure={message:e.message,stack:e.stack};}
finally{await b.close();fs.writeFileSync(out+'/result.json',JSON.stringify({passed:!failure,checks,errors,failure,scope:'agent report inspection, not human usability or app capacity'},null,2),{flag:'wx'});}
console.log(JSON.stringify({passed:!failure,checks,failure}));if(failure)process.exitCode=1;
