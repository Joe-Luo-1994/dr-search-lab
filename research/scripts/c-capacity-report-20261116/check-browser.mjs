import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const output='evidence/c-capacity-20261115/report-browser';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const checks=[],errors=[],external=[];let failure;
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
 await page.goto(pathToFileURL(path.resolve('docs/C_CAPACITY_RESULT_20261116.html')).href);
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow '+width);
  await page.screenshot({path:output+'/overview-'+width+'.png'});checks.push('viewport-'+width);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#tasks details summary').click();assert.equal(await page.locator('#tasks details').getAttribute('open'),'');
 assert.equal(await page.locator('#tasks details .row').count(),15);checks.push('all-15-stages-expand');
 await page.locator('#tasks details summary').click();
 await page.locator('#tasks .grid').screenshot({path:output+'/mobile-capacity.png'});
 await page.locator('#update').screenshot({path:output+'/mobile-update.png'});
 const broken=await page.locator('a[href]').evaluateAll(links=>links.map(a=>a.getAttribute('href')).filter(x=>!x.startsWith('#')));
 for(const href of broken)assert(fs.existsSync(path.resolve('docs',href)),'missing evidence link '+href);
 checks.push('local-evidence-links');
 await page.locator('h1').click();await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement!==document.body));checks.push('keyboard');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks.push('no-errors-or-external-network');
}catch(e){failure={message:e.message,stack:e.stack};}
finally{await browser.close();fs.writeFileSync(output+'/result.json',JSON.stringify({passed:!failure,checks,errors,external,failure,scope:'agent browser QA, not human comprehension or DR load'},null,2));}
console.log(JSON.stringify({passed:!failure,checks,failure}));if(failure)process.exitCode=1;
