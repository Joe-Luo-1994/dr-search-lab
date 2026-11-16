import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const out=process.env.REPORT_CHECK_OUT||'evidence/engine-comparison-20261116';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true}),checks=[],errors=[];let failure;
try{
const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(path.resolve('docs/DR_ENGINE_COMPARISON_20261116.html')).href);
for(const width of [320,390,1280]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('width-'+width);}
await p.setViewportSize({width:390,height:844});await p.screenshot({path:out+'/mobile.png'});
assert.equal(await p.locator('#choices article').count(),4);checks.push('four-options');
for(const d of await p.locator('details').all()){await d.locator('summary').click();assert(await d.evaluate(e=>e.open));}checks.push('expand-all');
assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('expanded-mobile-width');
for(const href of await p.locator('a[href]').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')))){if(href.startsWith('#'))assert(await p.locator(href).count());else if(!/^https?:/.test(href))assert(fs.existsSync(path.resolve('docs',href)),href);}checks.push('internal-links');
assert.deepEqual(errors,[]);checks.push('no-page-errors');
}catch(e){failure={message:e.message,stack:e.stack};}finally{await b.close();fs.writeFileSync(out+'/report-check.json',JSON.stringify({passed:!failure,checks,errors,failure,scope:'agent layout check only; no user acceptance or performance test'},null,2));}
console.log(JSON.stringify({passed:!failure,checks,failure}));if(failure)process.exitCode=1;
