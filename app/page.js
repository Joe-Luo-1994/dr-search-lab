'use client';
import { useEffect, useState } from 'react';

const initialQuery = { keyword: 'backup', spaceId: '', tagIds: [], page: 1, pageSize: 5, includeAttachments: false };
const ms = n => Number(n || 0).toFixed(2);
async function api(url, body) {
  const res = await fetch(`/api/lab/${url}`, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Request failed'); return data;
}
export default function Home() {
  const [lab, setLab] = useState(null), [query, setQuery] = useState(initialQuery), [selected, setSelected] = useState(['sqlite', 'minisearch', 'orama']);
  const [results, setResults] = useState({}), [busy, setBusy] = useState(false), [error, setError] = useState(''), [detail, setDetail] = useState(null), [tab, setTab] = useState('search');
  async function refresh() { setLab(await api('status')); }
  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);
  async function act(body) {
    setBusy(true); setError(''); setResults({}); setDetail(null);
    try { await api('control', body); } catch (e) { setError(e.message); }
    finally { await refresh().catch(e => setError(e.message)); setBusy(false); }
  }
  async function compare(event, override) {
    event?.preventDefault(); setBusy(true); setError(''); setResults({}); setDetail(null);
    const q = override || query;
    // Sequential on purpose: dashboard requests must not compete for the same process.
    for (const engine of selected) {
      try { const result = await api(`search/${engine}`, q); setResults(old => ({ ...old, [engine]: result })); }
      catch (e) { setResults(old => ({ ...old, [engine]: { error: e.message } })); }
    }
    setBusy(false);
  }
  function chooseScenario(s) { setQuery({ ...initialQuery, ...s, keyword: s.keyword }); setResults({}); }
  async function openPage(id) { try { setDetail(await api(`pages/${id}`)); } catch (e) { setError(e.message); } }
  function downloadReport() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), query, state: lab.state, results, limitations: lab.limitations }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'dr-search-observation.json'; a.click(); URL.revokeObjectURL(url);
  }
  if (!lab) return <main className="loading"><div className="logo">DR</div><h1>搜尋備援實驗室</h1><p>{error || '正在讀取實驗環境…'}</p></main>;
  const available = lab.engines.filter(e => e.ready).length;
  const completed = Object.entries(results).filter(([,r]) => !r.error);
  const common = completed.length > 1 ? completed[0][1].hits.map(h => h.id).filter(id => completed.every(([,r]) => r.hits.some(h => h.id === id))) : [];
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="logo">DR</span><div>SEARCH LAB<small>搜尋備援實驗室</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>⌕　搜尋比較 <span>01</span></button>
      <button className={`nav ${tab === 'recovery' ? 'active' : ''}`} onClick={() => setTab('recovery')}>↻　授權與版本 <span>02</span></button>
      <button className={`nav ${tab === 'design' ? 'active' : ''}`} onClick={() => setTab('design')}>▤　設計與邊界 <span>03</span></button>
      <div className="sidebar-bottom"><span className="live-dot"/> LOCAL EXPERIMENT<div>合成資料 · 唯讀內容<br/>本機 ReBAC 模擬</div><p>結果是證據，不是排名。</p></div>
    </aside>
    <main className="main">
      <header><div className="breadcrumb">Disaster Recovery <span>/</span> Search evaluation</div><span className="pill">PROTOTYPE · 0.1</span></header>
      <section className="heading"><div><div className="eyebrow">READ-ONLY / DAILY SNAPSHOT</div><h1>{tab === 'search' ? '相同條件，看見不同取捨。' : tab === 'recovery' ? '復原服務，也驗證存取邊界。' : '先界定承諾，再比較引擎。'}</h1><p>固定資料與授權，觀察搜尋差異。每個數字都來自實際執行。</p></div><button className="secondary" onClick={downloadReport} disabled={!completed.length}>匯出觀測 JSON ↗</button></section>
      <section className="stats"><div><span>可執行引擎</span><strong>{available}<small> / 7</small></strong><em>未連線者不產生結果</em></div><div><span>資料規模</span><strong>{lab.manifest?.count || '—'}<small> pages / v1</small></strong><em>可重現的合成資料</em></div><div><span>目前副本</span><strong>{lab.state.version.toUpperCase()}</strong><em>每日同步模型 · 非即時資料</em></div><div><span>恢復目標</span><strong>60<small> min</small></strong><em>討論目標，尚未驗收 RTO</em></div></section>
      {error && <div className="alert" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
      <div className="identity"><span className="identity-icon">◉</span><label>模擬使用者 <select aria-label="模擬使用者" value={lab.state.user} disabled={busy} onChange={e => act({ action: 'user', user: e.target.value })}>{Object.entries(lab.users).map(([id,u]) => <option key={id} value={id}>{u.name}</option>)}</select></label><span>ReBAC <b className={lab.state.rebacDown ? 'bad' : 'good'}>{lab.state.rebacDown ? '不可用 · 拒絕存取' : '模擬可用'}</b></span><span>已撤銷：{lab.state.revoked.join(', ') || '無'}</span></div>
      {tab === 'search' && <>
        <section className="panel query-panel"><div className="section-top"><h2>建立共同查詢</h2><span>Space ＋ Tags 為 AND；文字匹配依引擎設定</span></div>
          <form onSubmit={compare}><fieldset disabled={busy}><div className="search-line"><span>⌕</span><input aria-label="關鍵字" placeholder="輸入 keyword，搜尋 Title 與正文" maxLength={200} value={query.keyword} onChange={e => { setQuery({ ...query, keyword: e.target.value, page: 1 }); setResults({}); }}/><button className="primary" disabled={busy || !selected.length}>{busy ? '執行中…' : '比較搜尋 →'}</button></div>
            <div className="filters"><label>Space<select aria-label="Space" value={query.spaceId} onChange={e => { setQuery({ ...query, spaceId: e.target.value, page: 1 }); setResults({}); }}><option value="">全部可見 Space</option>{lab.spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><div className="tag-group"><span>Tags · 全部符合</span><div>{lab.tagIds.map(t => <button key={t} type="button" className={`tag ${query.tagIds.includes(t) ? 'selected' : ''}`} aria-pressed={query.tagIds.includes(t)} onClick={() => { setQuery({ ...query, page: 1, tagIds: query.tagIds.includes(t) ? query.tagIds.filter(x => x !== t) : [...query.tagIds, t] }); setResults({}); }}>{t}</button>)}</div></div><label className="check"><input type="checkbox" checked={query.includeAttachments} onChange={e => { setQuery({ ...query, includeAttachments: e.target.checked, page: 1 }); setResults({}); }}/>含附件解析文字</label></div>
          </fieldset></form><div className="scenario-row"><span>快速情境</span>{lab.scenarios.map(s => <button key={s.id} disabled={busy} onClick={() => chooseScenario(s)}>{s.title}</button>)}</div>
        </section>
        <div className="section-top results-heading"><h2>引擎觀測 <span className="count">{selected.length}</span></h2><div className="pagination"><label>每頁 <select aria-label="每頁筆數" value={query.pageSize} onChange={e => { setQuery({ ...query, pageSize: Number(e.target.value), page: 1 }); setResults({}); }}>{[3,5,10,20].map(n => <option key={n}>{n}</option>)}</select></label><button disabled={busy || query.page === 1} onClick={() => { const q = { ...query, page: query.page - 1 }; setQuery(q); compare(null,q); }}>←</button><span>第 {query.page} 頁</span><button disabled={busy || !completed.length || completed.every(([,r]) => query.page * query.pageSize >= r.total)} onClick={() => { const q = { ...query, page: query.page + 1 }; setQuery(q); compare(null,q); }}>→</button></div></div>
        <p className="fineprint">逐一執行，非負載測試。分數不可跨引擎比較；首次查詢可能包含載入。共同出現的本頁文件：{completed.length > 1 ? common.join(', ') || '無' : '等待至少兩個引擎結果'}。</p>
        <section className="engine-grid">{lab.engines.map(engine => { const result = results[engine.id]; return <article className={`engine-card ${!engine.ready ? 'offline' : ''}`} key={engine.id}><div className="engine-head"><label><input type="checkbox" disabled={!engine.ready || busy} checked={selected.includes(engine.id)} onChange={e => { setSelected(e.target.checked ? [...selected, engine.id] : selected.filter(x => x !== engine.id)); setResults({}); }}/><h3>{engine.name}</h3></label><span className={`status ${engine.ready ? 'ready' : ''}`}>{engine.ready ? '可執行' : '未驗證'}</span></div><div className="engine-type">{engine.type}</div><p className="engine-note">{engine.note}</p>
          {!engine.ready ? <div className="empty">{engine.reason}</div> : result?.error ? <div className="result-error">{result.error}</div> : result ? <><div className="metrics"><div><strong>{result.total}</strong><span>{result.totalRelation === 'estimated' ? '估計符合' : '符合筆數'}</span></div><div><strong>{ms(result.metrics.apiMs)}<small> ms</small></strong><span>API 內部耗時</span></div></div><div className="timing">搜尋 {ms(result.metrics.searchMs)} · 授權 {ms(result.metrics.authMs)} · 載入 {ms(result.metrics.loadMs)} ms</div><ol className="hits">{result.hits.map((h, i) => <li key={h.id}><span className="rank">{(result.query.page - 1) * result.query.pageSize + i + 1}</span><div><button onClick={() => openPage(h.id)}>{h.title}</button><small>{h.id} · {h.spaceId} · {h.tagIds.join(' / ')}</small></div>{common.includes(h.id) && <span title="所有已完成引擎的本頁皆有此文件" className="common">●</span>}</li>)}</ol>{!result.hits.length && <div className="empty">無符合且可見的結果</div>}</> : <div className="empty">選擇情境，執行共同查詢。</div>}
        </article>; })}</section>
      </>}
      {tab === 'recovery' && <section className="recovery-grid"><article className="panel"><h2>01 / 授權故障注入</h2><p>在同一份資料上改變授權。ReBAC 不可用時拒絕存取；撤權後閱讀與下載也重新檢查。</p><button className="secondary" disabled={busy} onClick={() => act({ action: 'revoke', spaceId: 'ops' })}>撤銷目前會話的 ops 權限</button><button className="secondary" disabled={busy} onClick={() => act({ action: 'rebac', down: !lab.state.rebacDown })}>{lab.state.rebacDown ? '恢復 ReBAC' : '模擬 ReBAC 故障'}</button><label>模擬授權延遲<select value={lab.state.rebacLatency} disabled={busy} onChange={e => act({ action: 'latency', ms: Number(e.target.value) })}>{[0,50,200].map(n => <option key={n} value={n}>{n} ms</option>)}</select></label></article><article className="panel"><h2>02 / 發布完整資料版本</h2><p>V2 將 p09 從 ops 移到 restricted，並新增 freshmarker。先驗證本地檔案 checksum，再切換本會話的版本。</p><button className="primary" disabled={busy} onClick={() => act({ action: 'publish', version: lab.state.version === 'v1' ? 'v2' : 'v1' })}>切換至 {lab.state.version === 'v1' ? 'V2' : 'V1'}</button><button className="secondary" disabled={busy} onClick={() => act({ action: 'publish', version: 'v2', simulateFailure: true })}>模擬同步失敗 · 保留舊版</button><p className="warning">這是本地發布示範；ES 已設定時也檢查兩份索引的內容指紋與寫入封鎖。不包含 MinIO 傳輸、DNS 或其他外部引擎驗證。</p></article><article className="panel"><h2>03 / 已知的舊關聯風險</h2><p>以 Alice 搜尋 transfermarker：V1 仍允許看見 p09；V2 才知道它已移到受限 Space。即時 Space Role 查詢不能修正舊資料中的歸屬。</p><button className="secondary" disabled={busy} onClick={() => { chooseScenario(lab.scenarios.find(s => s.id === 'moved')); setTab('search'); }}>前往比較這個情境 →</button><p>此 Demo 故意呈現風險，未宣稱已解決權限資料 RPO。</p></article><article className="panel"><h2>04 / 操作紀錄</h2>{lab.state.events.length ? lab.state.events.map((e,i) => <p key={i}><small>{e.at}</small><br/>{e.message}</p>) : <p>尚未發布新版本。</p>}<button className="secondary" disabled={busy} onClick={() => act({ action: 'reset' })}>重設本會話</button></article></section>}
      {tab === 'design' && <section className="panel design"><h2>已實作與尚未證明，分開呈現。</h2><div className="design-grid"><div><h3>共同契約</h3><p>Title／正文全文搜尋；Space 篩選；Tags 全部符合；在授權範圍內分頁；Page 與 Media 存取重新驗證。</p><h3>索引生命週期</h3><pre>合成 Page 資料 → 各引擎建索引<br/>→ 本地發布檔與 SHA-256 manifest<br/>→ Next.js 載入／查詢<br/>→ ReBAC 模擬 → 交付結果</pre></div><div><h3>目前邊界</h3><ul>{lab.limitations.map(x => <li key={x}>{x}</li>)}</ul><h3>避免錯誤結論</h3><p>預設語言與排名不同；沒有真實查詢案例，不能宣稱業務品質較佳。小樣本耗時不是容量結論，結果分數不是跨引擎共同單位。</p></div></div><h3>可重現的下一步</h3><pre>npm run prepare:data -- 1000<br/>npm test<br/>npm run benchmark<br/>docker compose up -d<br/>npm run provision</pre><p>重新產製資料前請停止 Next.js；完成後重新啟動，避免記憶體快取沿用舊索引。外部引擎需設定 .env.local 並 provision。</p></section>}
      <footer>DR SEARCH LAB <span>研究原型 · 不包含正式身分驗證 · 請只在本機使用</span><span>資料產製：{lab.manifest?.generatedAt || '尚未產製'}</span></footer>
    </main>
    {detail && <div className="modal-backdrop" onClick={() => setDetail(null)}><section role="dialog" aria-modal="true" aria-label="Page 閱讀" className="modal" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setDetail(null)}>關閉 ×</button><div className="eyebrow">AUTHORIZED PAGE / {detail.version}</div><h2>{detail.title}</h2><p className="fineprint">{detail.id} · {detail.spaceId} · {detail.tagIds.join(', ')}</p><p>{detail.bodyText}</p><h3>合成 Media · 下載時重新檢查</h3>{detail.mediaIds.map(id => <a className="download" key={id} href={`/api/lab/pages/${detail.id}?mediaId=${id}`}>↓ {id}.txt</a>)}<p className="fineprint">請求必須帶 Page ID，且 Media 必須屬於該 Page。所有內容都是測試資料。</p></section></div>}
  </div>;
}
