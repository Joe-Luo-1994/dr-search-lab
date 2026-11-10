// Isolated synthetic Pagefind demonstration. Never reads production or existing .lab/data.
import * as pagefind from './node_modules/pagefind/lib/index.js';
import { generateDataset } from '../../lib/dataset.mjs';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

export async function buildDemo() {
  await mkdir('.lab/pagefind', { recursive: true });
  const root = await mkdtemp(path.resolve('.lab/pagefind/run-'));
  const created = await pagefind.createIndex({ forceLanguage: 'zh' });
  if (created.errors?.length || !created.index) throw new Error(JSON.stringify(created.errors));
  try {
    for (const p of generateDataset(100, 'v1').pages) {
      const result = await created.index.addCustomRecord({
        url: `/synthetic/${p.id}`, language: 'zh',
        content: `${p.title}\n${p.bodyText}\n${p.attachmentText}`,
        meta: { title: p.title, id: p.id }, filters: { space: [p.spaceId], tags: p.tagIds },
      });
      if (result.errors?.length) throw new Error(JSON.stringify(result.errors));
    }
    const written = await created.index.writeFiles({ outputPath: path.join(root, 'pagefind') });
    if (written.errors?.length) throw new Error(JSON.stringify(written.errors));
    await writeFile(path.join(root, 'index.html'), html);
    return { root, nodeExports: Object.keys(pagefind).sort() };
  } finally { await pagefind.close(); }
}

export async function serveDemo(root, port = 0) {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const bytes = await readFile(file);
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pagefind：減少服務後，哪些責任仍在？</title>
<style>body{font:18px/1.6 system-ui;max-width:920px;margin:3rem auto;padding:0 1.3rem;color:#16312e;background:#f5f5ef}h1{line-height:1.2}small{color:#586862}button,input,select{font:inherit;padding:.5rem;margin:.3rem 0}article{border-top:1px solid #b8cbc1;padding:1rem 0}#notice{background:#fff1c8;padding:1rem}input{max-width:90%}</style>
<p>DR 提案討論 · 合成資料 · Pagefind 1.6.0</p><h1>少一個搜尋服務，是否也少了整體工作？</h1>
<p>此頁將 100 篇合成文件建成同一個瀏覽器索引，包含受限 Space。供比較搜尋任務與資料交付邊界。</p>
<p id="notice">這個獨立 Demo 沒有登入／ReBAC；Space 篩選只是查詢條件。不要接真實內容。結果讀取是索引中的文字，沒有串接正文／附件 API。</p>
<label>關鍵字 <input id="query" value="資料庫備份"></label><br>
<label>查詢範圍 <select id="scope"><option value="ops">UI 限定 ops</option><option value="all">移除 UI 篩選（模擬直接呼叫）</option></select></label>
<button id="search">搜尋</button><p id="status" role="status">就緒</p><div id="results"></div>
<h2>現場操作</h2><ol><li>搜尋「資料庫備份」，確認 p01 與 p07 是否符合任務。</li><li>搜尋「confidential」，先用 ops，再移除篩選，比較能取得的內容。</li><li>討論：同權限群組能否安全共用整包索引？撤權後已下載資料如何處理？</li></ol>
<p>若需 server-side ReBAC 與 consumer API，仍須設計共用契約或另一個查詢介面。Node 建索引 API 不等於正式 server 查詢 API。</p>
<script type="module">
const pf=await import('/pagefind/pagefind.js');
document.querySelector('#search').onclick=async()=>{
 const status=document.querySelector('#status'), results=document.querySelector('#results');results.replaceChildren();status.textContent='搜尋中…';
 try{const scope=document.querySelector('#scope').value;const r=await pf.search(document.querySelector('#query').value,scope==='ops'?{filters:{space:'ops'}}:{});
 status.textContent=r.results.length+' 筆（最多顯示 20 筆）';for(const hit of r.results.slice(0,20)){const d=await hit.data();const a=document.createElement('article'),h=document.createElement('h3'),p=document.createElement('p');h.textContent=d.meta.id+' · '+d.meta.title;p.textContent=d.content;a.append(h,p);results.append(a)}}catch(e){status.textContent='失敗：'+e.message}
};</script></html>`;
