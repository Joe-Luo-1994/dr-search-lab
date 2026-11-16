import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export async function runUi({engine,origin,out,signal}){
 const checks=[],errors=[],httpErrors=[],started=Date.now();
 signal.throwIfAborted();
 const browser=await chromium.launch({channel:'msedge',headless:true});
 let stopped=false;
 const terminate=()=>{stopped=true;browser.close().catch(()=>{});};
 signal.addEventListener('abort',terminate,{once:true});
 if(signal.aborted){await browser.close();throw signal.reason;}
 const context=await browser.newContext({viewport:{width:375,height:812},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)httpErrors.push({status:r.status(),url:r.url()});});
 async function task(id,work){if(stopped||signal.aborted){checks.push({id,passed:false,skipped:true,error:'STOPPED'});return;}const t=Date.now();let timeout;try{await Promise.race([work(),new Promise((_,reject)=>{timeout=setTimeout(()=>{terminate();reject(Error('UI_TASK_DEADLINE'));},30000);})]);signal.throwIfAborted();checks.push({id,passed:true,durationMs:Date.now()-t});}catch(e){checks.push({id,passed:false,error:e.message,durationMs:Date.now()-t});}finally{clearTimeout(timeout);}}
 const search=async(q)=>{await page.getByLabel('搜尋頁面或 PDF 文字',{exact:true}).fill(q);await Promise.all([page.waitForResponse(r=>r.url().startsWith(origin+'/api/search?')),page.getByRole('button',{name:'搜尋',exact:true}).click()]);await page.locator('#results').waitFor();};
 try{
  await page.goto(origin,{waitUntil:'networkidle'});
  await task('pdf-search-read-download',async()=>{
   await search('silverline certificate');
   await page.getByRole('button',{name:'異地部署檢查表',exact:true}).click();
   await page.locator('article h2').waitFor();
   assert.equal(await page.locator('article h2').textContent(),'異地部署檢查表');
   await page.waitForFunction(()=>document.activeElement?.matches('article h2'));
   await page.getByRole('button',{name:'載入 deployment-checklist.pdf',exact:true}).click();
   await page.getByRole('link',{name:'下載 PDF',exact:true}).waitFor();
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'下載 PDF',exact:true}).click()]);
   const file=await download.path();assert(file,'DOWNLOAD_PATH');const bytes=await fs.readFile(file);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),'f396877a93e9980d03a314270f6d566ced0784e0661e9517abacc89d9f41a6ef');
   assert.equal(download.suggestedFilename(),'deployment-checklist.pdf');
   await page.locator('iframe[title^="PDF 預覽"]').waitFor();await page.waitForTimeout(1000);
   await page.screenshot({path:path.join(out,`ui-${engine}-pdf-mobile.png`),fullPage:true});
   const [popup]=await Promise.all([page.waitForEvent('popup'),page.getByRole('link',{name:'在新分頁開啟 PDF',exact:true}).click()]);
   await popup.waitForLoadState('domcontentloaded').catch(()=>{});assert(popup.url().startsWith('blob:'),'PDF_POPUP_URL');await popup.close();
   await page.getByRole('button',{name:'← 返回搜尋結果',exact:true}).click();
   await page.waitForFunction(()=>document.activeElement?.id==='result-a-pdf');
  });
  await task('tags-and',async()=>{
   if(await page.locator('article').count())await page.getByRole('button',{name:'← 返回搜尋結果',exact:true}).click();
   await page.getByRole('checkbox',{name:'手冊',exact:true}).check();await page.getByRole('checkbox',{name:'已驗證',exact:true}).check();await search('dispatch');
   assert.equal(await page.locator('.result-link').count(),1);assert.equal(await page.locator('.result-link').textContent(),'Dispatch Handbook');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'MOBILE_OVERFLOW');
   await page.screenshot({path:path.join(out,`ui-${engine}-tags-mobile.png`),fullPage:true});
  });
  await task('empty-and-unknown',async()=>{
   await page.getByRole('checkbox',{name:'手冊',exact:true}).uncheck();await page.getByRole('checkbox',{name:'已驗證',exact:true}).uncheck();await search('azimuthunlisted');
   assert.equal(await page.locator('#results').textContent(),'沒有符合的頁面');
   await page.getByLabel('研究身份',{exact:true}).selectOption('unknown');assert.equal(await page.locator('.result-link').count(),0);
   await page.getByLabel('搜尋頁面或 PDF 文字',{exact:true}).fill('relay');await page.getByRole('button',{name:'搜尋',exact:true}).click();
   await page.getByRole('alert').waitFor();assert((await page.getByRole('alert').textContent()).includes('無法確認存取權限'));assert.equal(await page.locator('#results').count(),0);
   await page.screenshot({path:path.join(out,`ui-${engine}-error-mobile.png`),fullPage:true});
  });
  await task('PUBLIC-HOST-and-identity-clear',async()=>{
   await page.setViewportSize({width:1280,height:900});await page.getByLabel('研究身份',{exact:true}).selectOption('a');await search('relay');
   assert.equal(await page.locator('.result-link').count(),10);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(out,`ui-${engine}-desktop.png`),fullPage:true});
   await page.getByLabel('研究身份',{exact:true}).selectOption('none');assert.equal(await page.locator('.result-link').count(),0);
  });
 }finally{signal.removeEventListener('abort',terminate);await browser.close();}
 const result={engine,passed:checks.length===4&&checks.every(c=>c.passed)&&errors.length===0,checks,pageErrors:errors,httpErrors,browser:browser.version(),durationMs:Date.now()-started,pdfViewer:'iframe and blob popup observed; screenshot visual inspection required; not company editor acceptance'};
 await fs.writeFile(path.join(out,`ui-${engine}.json`),JSON.stringify(result,null,2));return result;
}
