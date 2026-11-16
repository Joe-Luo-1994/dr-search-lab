import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='evidence/c-million-20261116/browser-smoke';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[],checks=[];let failure;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},extraHTTPHeaders:{'x-cap-identity':'all','x-cap-lane':'browser-preflight'}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3174/docs/p000001');await page.getByRole('heading',{name:'Knowledge page p000001'}).waitFor();checks.push('SSR document displayed');
 await page.getByLabel('搜尋文件').fill('uniquep000003');await page.getByRole('button',{name:'搜尋',exact:true}).click();
 const link=page.locator('ul[aria-label="搜尋結果"] a').first();await link.waitFor();const label=await link.innerText();assert(label.startsWith('Knowledge page p000003'));
 await link.click();await page.waitForURL(/\/docs\/p000003\?version=v[12]/);assert.equal(await page.locator('main').getAttribute('data-pageid'),'p000003');
 assert((await page.locator('pre').innerText()).includes('uniquep000003'));checks.push('search -> returned hit -> SSR page content');
 await page.screenshot({path:out+'/mobile-document.png',fullPage:true});
 assert.deepEqual(errors,[]);checks.push('no browser JS errors');
}catch(e){failure={message:e.message,stack:e.stack};}
finally{await browser.close();fs.writeFileSync(out+'/result.json',JSON.stringify({passed:!failure,checks,errors,failure,scope:'isolated author browser preflight with explicit synthetic identity, outside formal load; not company editor or human usability'},null,2),{flag:'wx'});}
console.log(JSON.stringify({passed:!failure,checks,failure}));if(failure)process.exitCode=1;
