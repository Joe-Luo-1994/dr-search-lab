import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {source,eligible,parsePageId} from '../c-million-20261116/source.mjs';
const oracle=JSON.parse(fs.readFileSync('evidence/c-million-20261116/fixture-1000000/oracle.json','utf8'));
const out='evidence/c-web-search-20261116/browser-smoke';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],errors=[];let failure;
try{
 const page=await browser.newPage({viewport:{width:390,height:844},extraHTTPHeaders:{'x-cap-identity':'all','x-cap-lane':'web-browser-preflight'}});
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:3176/docs/p000001?version=v1');
 await page.getByRole('heading',{name:'Knowledge page p000001',exact:true}).waitFor();
 for(const id of ['common','rare','chinese','absent','pdf']){
  const q=oracle.versions.v1.queries.find(x=>x.id===id);assert(q);
  await page.getByLabel('搜尋文件').fill(q.q);
  const result=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/capi/search');
  await page.getByRole('button',{name:'搜尋',exact:true}).click();const response=await result;assert.equal(response.status(),200);
  const json=await response.json();assert.equal(json.total,q.total);assert.equal(json.snapshotId,'v1');assert.equal(json.hits.length,Math.min(10,q.total));
  for(const hit of json.hits){const expected=source(parsePageId(hit.pageId,1000000,'v1'),'v1',1000000);assert(eligible(id,expected));assert.equal(hit.title,expected.title);}
  const titles=json.hits.map(x=>x.title);
  await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('ul[aria-label="搜尋結果"] a')].map(x=>x.textContent))===JSON.stringify(expected),titles);
  checks.push({queryId:id,total:json.total,visibleHits:titles.length,passed:true});
  if(id==='common')await page.screenshot({path:out+'/common-mobile.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);
}catch(e){failure={message:e.message,stack:e.stack};}
finally{await browser.close();fs.writeFileSync(out+'/result.json',JSON.stringify({passed:!failure,checks,errors,failure,scope:'Five text queries via existing form on 1M corpus before formal load. Filters/identity controls absent; no load/browser-latency or human UX claim; warms cache.'},null,2),{flag:'wx'});}
console.log(JSON.stringify({passed:!failure,checks,failure}));if(failure)process.exitCode=1;
