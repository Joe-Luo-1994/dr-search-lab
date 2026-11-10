// Meeting flow: navigation, evidence boundaries, draft export and narrow/keyboard use.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const base=process.env.LAB_BASE_URL || 'http://127.0.0.1:3100';
const out=process.argv[2] || '.lab/internal-demo';
await mkdir(out,{recursive:true});
const report={at:new Date().toISOString(),checks:[]};
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1360,height:1000},acceptDownloads:true});
 page.setDefaultTimeout(15000);
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url(),body:r.postData()}));
 const nav=page.getByRole('navigation',{name:'討論流程'});
 await page.goto(base+'/briefing');
 await page.getByRole('heading',{name:/讓 DR 用得上，\s*也維護得起。/}).waitFor();
 for(const role of ['Reviewer','DevOps','核心 Consumer','產品 User／PM'])assert((await page.locator('main').innerText()).includes(role));
 report.checks.push('opening shows existing DR and four stakeholder questions');
 await page.screenshot({path:out+'/briefing-desktop.png',fullPage:true});
 await nav.getByRole('button',{name:/一起看證據/}).focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.activeElement===document.getElementById('step-heading'));
 assert.equal(await page.locator('#step-heading').evaluate(e=>document.activeElement===e),true);
 report.checks.push('keyboard step navigation moves focus to heading');
 const link=page.getByRole('link',{name:'開啟互動 Lab ↗'});assert.equal(await link.getAttribute('href'),'/');assert.equal(await link.getAttribute('target'),'_blank');report.checks.push('Lab opens separately so discussion state is retained');
 for(const name of ['中文與 Pagefind','權限服務暫時失效','更新失敗，舊版能否使用'])await page.getByRole('button',{name:new RegExp(name)}).click();
 assert((await page.locator('section').innerText()).includes('404'));report.checks.push('scenario selection retains failure counterexample');
 await page.getByRole('button',{name:/中文與 Pagefind/}).click();
 assert((await page.locator('section').innerText()).includes('前端篩選不是授權'));assert.equal(await page.getByRole('link',{name:'開啟互動 Lab ↗'}).count(),0);report.checks.push('Pagefind boundary stays visible without invented service link');
 await nav.getByRole('button',{name:/比較收益與負擔/}).click();
 assert.equal(await page.locator('section article').count(),3);report.checks.push('three candidates include value cost and conditions');
 await page.getByText('現有 Harbor 能降低哪部分成本？',{exact:true}).click();assert((await page.locator('section').innerText()).includes('雲端尚未連到內網'));report.checks.push('Harbor information remains explicitly unverified');
 await nav.getByRole('button',{name:/留下下一步/}).click();
 assert.deepEqual(await page.locator('select').evaluateAll(es=>es.map(e=>e.value)),['待確認','待確認','待確認']);report.checks.push('discussion starts with no implied approvals');
 await page.locator('#resources-note').fill('合成討論：先查核准映像與可寫磁碟');
 await page.locator('#resources-state').selectOption('需補證據');
 await nav.getByRole('button',{name:/對齊現況/}).click();await nav.getByRole('button',{name:/留下下一步/}).click();assert.equal(await page.locator('#resources-note').inputValue(),'合成討論：先查核准映像與可寫磁碟');report.checks.push('draft survives step changes');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下載討論草稿 ↓'}).click();const download=await pending;await download.saveAs(out+'/discussion-test-draft.json');
 const draft=JSON.parse(await readFile(out+'/discussion-test-draft.json','utf8'));assert(draft.kind.includes('not formal approval'));assert.equal(draft.topics[1].note,'合成討論：先查核准映像與可寫磁碟');assert.equal(draft.topics[1].state,'需補證據');report.checks.push('explicit local export preserves draft and pending status');
 assert(!requests.some(r=>r.method!=='GET'||r.body?.includes('合成討論')));report.checks.push('discussion interaction makes no write requests');
 await page.reload();await nav.getByRole('button',{name:/留下下一步/}).click();assert.equal(await page.locator('#resources-note').inputValue(),'');report.checks.push('reload clears in-memory notes as described');
 await page.setViewportSize({width:390,height:844});
 for(const name of ['對齊現況','一起看證據','比較收益與負擔','留下下一步']){
  await nav.getByRole('button',{name:new RegExp(name)}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await nav.getByRole('button',{name:/一起看證據/}).click();await page.getByRole('button',{name:/中文與 Pagefind/}).click();await page.screenshot({path:out+'/briefing-mobile.png',fullPage:true});report.checks.push('all four steps fit narrow viewport');
 assert.deepEqual(errors,[]);report.checks.push('no browser page errors');report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;process.exitCode=1}
finally{await browser.close();await writeFile(out+'/briefing-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
