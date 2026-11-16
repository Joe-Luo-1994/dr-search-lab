import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const out='evidence/c-million-20261116/report-browser';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const checks=[],errors=[],external=[];let failure;
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
 await page.goto(pathToFileURL(path.resolve('docs/C_MILLION_RESULT_20261116.html')).href);
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow '+width);
  await page.screenshot({path:out+'/overview-'+width+'.png'});checks.push('viewport-'+width);
 }
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('#tasks .card').count(),6);checks.push('six-measured-stages');
 await page.locator('#tasks .card').nth(3).locator('summary').click();assert.equal(await page.locator('#tasks .card').nth(3).locator('details').getAttribute('open'),'');
 assert((await page.locator('#tasks .card').nth(3).innerText()).includes('restricted-tags'));checks.push('query-details-open');
 await page.locator('#architecture').screenshot({path:out+'/architecture-mobile.png'});
 await page.locator('#update').screenshot({path:out+'/update-mobile.png'});
 const text=await page.locator('#update').innerText();assert(text.includes('477')&&text.includes('423')&&text.includes('V2 未啟用'));checks.push('failure-and-cancellation-visible');
 for(const href of await page.locator('a[href]').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')).filter(x=>!x.startsWith('#'))))assert(fs.existsSync(path.resolve('docs',href)),href);
 checks.push('evidence-links');await page.locator('h1').click();await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement!==document.body));checks.push('keyboard');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks.push('no-js-errors-or-network');
}catch(e){failure={message:e.message,stack:e.stack};}
finally{await browser.close();fs.writeFileSync(out+'/result.json',JSON.stringify({passed:!failure,checks,errors,external,failure,scope:'agent browser inspection, not human comprehension or product load'},null,2),{flag:'wx'});}
console.log(JSON.stringify({passed:!failure,checks,failure}));if(failure)process.exitCode=1;
