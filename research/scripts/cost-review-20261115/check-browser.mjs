import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='evidence/cost-review-20261115';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const checks=[],errors=[],external=[];
let failure;
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
 await page.goto(pathToFileURL(path.resolve('docs/DR_COST_DECISION_20261115.html')).href);
 const text=id=>page.locator('#'+id).innerText();
 async function check(name,fn){await fn();checks.push(name);}
 await check('unknown is not zero',async()=>{assert.equal(await text('threshold-value'),'未知');assert.equal(await text('delta-value'),'未知');assert.equal(await text('local'),'待輸入');});
 await check('index estimates independent of reading unknowns',async()=>{await page.locator('#I').fill('512');assert.equal(await text('local'),'3 GiB');assert.equal(await text('cross'),'512 MiB');assert.equal(await text('content'),'待輸入');});
 await check('daily and four-hour distinct transport layers',async()=>{
  await page.locator('#physical-example').click();assert.equal(await text('local'),'3 GiB');assert.equal(await text('cross'),'512 MiB');assert.equal(await text('install'),'1 GiB');assert.equal(await text('content'),'1.68 GiB');assert.equal(await text('gets'),'2,200 次');
  await page.locator('#four-hour').click();assert.equal(await text('cross'),'3 GiB');assert.equal(await text('install'),'6 GiB');assert.equal(await text('gets'),'2,200 次');
 });
 await check('pod count does not multiply shared cross-region copy or fixed reads',async()=>{await page.locator('#P').fill('4');assert.equal(await text('cross'),'3 GiB');assert.equal(await text('install'),'12 GiB');assert.equal(await text('gets'),'2,200 次');});
 await check('oversized body boundary is visible with other unknowns',async()=>{await page.locator('#clear-physical').click();await page.locator('#scale details').first().locator('summary').click();await page.locator('#B').fill('2048');assert((await text('physical-bound')).includes('超過'));});
 await check('one-site financial example',async()=>{await page.locator('#financial-example').click();assert.equal(await text('threshold-value'),'25,000 元');assert.equal(await text('delta-value'),'360,000 元');assert((await text('economic-conclusion')).includes('較高'));});
 await check('four-site example and provenance',async()=>{await page.locator('#four-sites').click();assert.equal(await text('threshold-value'),'6,250 元');assert.equal(await text('delta-value'),'-360,000 元');assert(!(await text('physical-origin')).includes('2地'));});
 await page.locator('#threshold .calc').screenshot({path:out+'/mobile-threshold.png'});
 await check('zero saving is real zero',async()=>{await page.locator('#saving').fill('0');assert.equal(await text('delta-value'),'600,000 元');});
 await check('blank saving preserves threshold without invented delta',async()=>{await page.locator('#saving').fill('');assert.equal(await text('threshold-value'),'6,250 元');assert.equal(await text('delta-value'),'未知');});
 await check('candidate change clears unrelated cost assumptions',async()=>{await page.locator('#pair').selectOption('B-A');assert.equal(await page.locator('#setup').inputValue(),'');assert.equal(await text('delta-value'),'未知');});
 await check('invalid site value never produces infinity',async()=>{await page.locator('#N').fill('0');assert((await text('financial-error')).includes('正整數'));assert.equal(await text('threshold-value'),'輸入有誤');await page.locator('#N').fill('1');});
 await check('responsive layouts and keyboard access',async()=>{
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});await page.evaluate(()=>window.scrollTo(0,0));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);await page.screenshot({path:out+'/overview-'+width+'.png'});}
  await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement!==document.body));
 });
 await check('no errors or network dependencies',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});
}catch(e){failure={message:e.message,stack:e.stack};}
finally{await browser.close();fs.writeFileSync(out+'/browser-result.json',JSON.stringify({checks,passed:!failure,errors,external,failure,scope:'Agent browser review of decision material, not human usability or DR experiment'},null,2),{flag:'wx'});}
console.log(JSON.stringify({passed:!failure,checks:checks.length,failure}));if(failure)process.exitCode=1;
