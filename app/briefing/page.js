'use client';

import { useState } from 'react';
import styles from './page.module.css';

const steps = ['對齊現況', '一起看證據', '比較收益與負擔', '留下下一步'];
const tasks = [
  { title:'找到文件，繼續工作', question:'真正重要的搜尋任務，是哪幾個？', action:'在互動 Lab 選「Space＋Tags AND」，開啟 Database backup runbook。', result:'三個 Web 內嵌引擎可找到 p01，並提供合成正文讀取。', gap:'正式資料、consumer 欄位與搜尋品質未確認。HTTP 下載仍是示意文字。', audience:'PM · 核心 Consumer', evidence:'Linux 新副本：36 tests、13 browser checks；合成資料與 mock 身份。', ask:'請提出一個「找不到就無法繼續工作」的文件或任務。', link:true },
  { title:'中文與 Pagefind', question:'少一個搜尋服務，總工作是否也變少？', action:'主 Lab 比較「資料庫備份」；Pagefind 獨立 Demo 查同一詞，再比較 confidential 的 ops／不設篩選。', result:'Pagefind 找到 p07、p02、p01。共用索引移除前端篩選後，可取得受限 p11 的合成文字。', gap:'前端篩選不是授權。整包交付、分包、撤權與 consumer 查詢接口仍需設計。', audience:'DevOps · FDE · PM', evidence:'Pagefind 1.6.0：8 查詢、10 檢查。是獨立實驗；沒有整合正式 ReBAC／MinIO。', ask:'我們有可共用同一權限的資料群組嗎？現有資產服務能處理哪些邊界？' },
  { title:'權限服務暫時失效', question:'什麼可以降級，什麼必須拒絕？', action:'在主 Lab 切換 Guest，再模擬 ReBAC 故障，觀察搜尋、正文與下載路徑。', result:'合成規則對無權限使用者拒絕，mock ReBAC 故障回 503。', gap:'尚非正式登入與 ReBAC。可用性、舊資料披露與撤權時效要有政策。', audience:'DevOps · FDE · Reviewer', evidence:'既有 HTTP probe 與 browser smoke；不代表公司授權服務已驗收。', ask:'事故期間可以接受的舊資料範圍，與不可接受的權限風險是什麼？', link:true },
  { title:'更新失敗，舊版能否使用', question:'失敗時使用者與 Consumer 會看見什麼？', action:'模擬同步失敗；另以 V1 搜尋 transfermarker，切 V2 後再讀 p09。', result:'模擬同步失敗保留 V1；跨請求未固定版本時，原本的 p09 可變成 404。', gap:'MinIO 傳輸中斷／程序重啟尚未驗證。不能將示範按鈕當成真正發布演練。', audience:'DevOps · 核心 Consumer', evidence:'版本反例保留。獨立 reader 歷史測試另有 425 次 binary 下載，未接入 HTTP。', ask:'Consumer 能否接受版本識別？完整舊版與最新授權發生衝突時如何處理？', link:true },
];
const options = [
  {title:'Web 內嵌搜尋',value:'沿用 Web，網站與 API 有機會共用查詢與授權。',cost:'應用承擔資源競爭、索引載入、發布與復原。',condition:'現有 Node／磁碟可用；容量與必要查詢通過。'},
  {title:'Pagefind',value:'靜態索引由瀏覽器查詢，可能減少常駐服務。',cost:'權限分包、client 交付、撤權；consumer 可能需要額外接口。',condition:'整包可交付或已有可維護的保護機制；接入成本可接受。'},
  {title:'獨立搜尋服務',value:'查詢資源可分開管理，可能沿用既有搜尋能力。',cost:'新增部署、監控、升級、還原與服務依賴。',condition:'Web 方案無法滿足必要任務／容量，新增維運收益值得。'},
];
const initialTopics = [
  {id:'candidate',title:'優先驗證的候選與轉向條件',state:'待確認',note:'',owner:''},
  {id:'resources',title:'Harbor／npm／資源的最小確認',state:'待確認',note:'',owner:''},
  {id:'challenge',title:'帶給 FDE 與一個 Consumer 的問題',state:'待確認',note:'',owner:''},
];

export default function Briefing() {
  const [step,setStep]=useState(0), [task,setTask]=useState(0);
  const [topics,setTopics]=useState(initialTopics), [notice,setNotice]=useState('');
  function go(index){setStep(index);setNotice('');requestAnimationFrame(()=>document.getElementById('step-heading')?.focus());}
  function edit(id,key,value){setTopics(current=>current.map(t=>t.id===id?{...t,[key]:value}:t));}
  function download(){
    const draft={kind:'DR discussion draft; not formal approval',createdAt:new Date().toISOString(),syntheticDemo:true,topics};
    const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='dr-discussion-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setNotice('已產生討論草稿下載；仍需對口確認。頁面沒有儲存副本。');
  }
  const current=tasks[task];
  return <main className={styles.main}>
    <div className={styles.masthead}><span>DR · WORKING SESSION</span><span>內部 v1 準備 / 合成 Demo</span></div>
    <div className={styles.intro}><div><p className={styles.eyebrow}>沿用現有資源，一起補齊必要能力</p><h1>讓 DR 用得上，<br/>也維護得起。</h1></div><p>今天先形成一個有條件的方向，<br/>帶著真正的問題找 FDE 與核心 Consumer。</p></div>
    <nav aria-label="討論流程" className={styles.steps}>{steps.map((label,i)=><button key={label} aria-current={step===i?'step':undefined} onClick={()=>go(i)}><span>0{i+1}</span>{label}</button>)}</nav>
    <div className={styles.scope}><span>展示範圍</span> 合成資料 · mock 身份 · 內部部署與正式需求待確認 <details><summary>證據邊界</summary><p>雲端 Linux 已完成新副本啟動與測試。公司 Harbor、容器、內部入口、正式 ReBAC／MinIO／consumer 尚未驗收。HTTP 下載為示意文字；測試次數不等於需求已滿足。</p></details></div>
    <section className={styles.stage} aria-labelledby="step-heading">
      {step===0 && <>
        <p className={styles.eyebrow}>01 / 共同底圖</p><h2 id="step-heading" tabIndex={-1}>我們已有 DR，現在要補哪段價值？</h2>
        <p className={styles.lead}>先請 DevOps 修正這張現況圖。這是依目前對話整理，尚未核對公司配置。</p>
        <div className={styles.diagram} aria-label="現況：來源經 Cronjob 備份到 MinIO，由 Next.js 讀取並使用內部 ReBAC"><div className={styles.flow}><span>正式來源</span><b aria-hidden="true">→</b><span>Cronjob</span><b aria-hidden="true">→</b><span>MinIO</span><b aria-hidden="true">→</b><strong>Next.js DR</strong></div><p>Next.js ↔ 內部 ReBAC（權限驗證尚不完整）</p></div>
        <div className={styles.split}><div><h3>已經運作</h3><p>唯讀網站、備份與物件儲存；PM 已確認 readonly、下載、搜尋方向。</p></div><div><h3>這次要補齊</h3><p>搜尋、核心 Consumer API、授權完整性，以及可維護的版本發布。</p></div></div>
        <div className={styles.audiences}>
          <p><strong>Reviewer</strong><span>事故中能繼續哪些任務？需要協調誰？</span></p><p><strong>DevOps</strong><span>新增哪些工作？現有資源能否承擔？</span></p><p><strong>核心 Consumer</strong><span>接入要改多少？失敗時行為能否預期？</span></p><p><strong>產品 User／PM</strong><span>找得到、讀得到、下載正確且有權限嗎？</span></p>
        </div><aside className={styles.prompt}><span>一起回答</span><p>現況圖哪裡需要修正？哪一個缺口對你影響最大？</p><small>「還不知道」也有價值：記下需要的證據與適合確認的人。</small></aside>
      </>}
      {step===1 && <>
        <p className={styles.eyebrow}>02 / 從操作看差距</p><h2 id="step-heading" tabIndex={-1}>一次看一個情境，再談它代表什麼。</h2>
        <div className={styles.choices} aria-label="選擇情境">{tasks.map((t,i)=><button key={t.title} aria-pressed={task===i} onClick={()=>setTask(i)}>{String(i+1).padStart(2,'0')} {t.title}</button>)}</div>
        <div className={styles.case}><p className={styles.eyebrow}>{current.audience}</p><h3>{current.question}</h3><p>{current.action}</p>{current.link?<a href="/" target="_blank" rel="noreferrer" className={styles.action}>開啟互動 Lab ↗</a>:<p className={styles.setup}>Pagefind 使用獨立本地服務；內部操作方式見 docs/INTERNAL_DEMO.md。沒有自動連結至雲端 localhost。</p>}
          <div className={styles.split}><div><h4>目前看到的證據</h4><p>{current.result}</p></div><div><h4>尚未跨過的門檻</h4><p>{current.gap}</p></div></div>
          <details><summary>查看證據範圍</summary><p>{current.evidence}</p></details>
        </div><aside className={styles.prompt}><span>一起回答</span><p>{current.ask}</p></aside>
      </>}
      {step===2 && <>
        <p className={styles.eyebrow}>03 / 收益要大於新增負擔</p><h2 id="step-heading" tabIndex={-1}>同一個目標，工作會落在不同地方。</h2><p className={styles.lead}>尚未選定最終架構。下表比較總體責任；consumer 與正式授權不會因選了引擎自動完成。</p>
        <div className={styles.comparison}>{options.map(o=><article key={o.title}><h3>{o.title}</h3><h4>可能帶來</h4><p>{o.value}</p><h4>需要承擔</h4><p>{o.cost}</p><h4>保留候選的條件</h4><p>{o.condition}</p></article>)}</div>
        <details className={styles.harbor}><summary>現有 Harbor 能降低哪部分成本？</summary><p>先由內網 agent 與 DevOps 查既有專案、Node 版本／架構／digest、維護 owner，再確認 npm 與必要原生套件來源。雲端尚未連到內網，不假設公共映像可拉取。</p><p>找不到映像 ≠ 架構不可行；先區分無權查看、尚未同步、版本差異與確實不適用。探索卡見 docs/INTERNAL_HARBOR_DISCOVERY.md。</p></details>
        <aside className={styles.prompt}><span>一起回答</span><p>哪個候選最能利用現有資源？出現什麼證據時，我們願意轉向？</p><small>先選一個值得驗證的方向，附上投入上限；不要求今天替整個方案背書。</small></aside>
      </>}
      {step===3 && <>
        <p className={styles.eyebrow}>04 / 把討論變成小步前進</p><h2 id="step-heading" tabIndex={-1}>帶走共識、未知與下一個負責窗口。</h2><p className={styles.lead}>這是討論草稿，不是正式簽核。只記去敏結論；勿輸入憑證、正式內容或個資。</p>
        <p className={styles.localNote}>輸入只留在此頁記憶體，重新整理會清除。需要保留時，可下載到自己的裝置；沒有儲存 API。</p>
        <div className={styles.topics}>{topics.map(t=><fieldset key={t.id}><legend>{t.title}</legend><div className={styles.fields}><label htmlFor={t.id+'-state'}>討論狀態<select id={t.id+'-state'} value={t.state} onChange={e=>edit(t.id,'state',e.target.value)}><option>待確認</option><option>需補證據</option><option>暫定方向，待對口確認</option></select></label><label htmlFor={t.id+'-owner'}>負責窗口／下一次檢查點<input id={t.id+'-owner'} value={t.owner} onChange={e=>edit(t.id,'owner',e.target.value)} placeholder="尚未指定" maxLength={160}/></label></div><label htmlFor={t.id+'-note'}>結論、條件或下一個問題<textarea id={t.id+'-note'} value={t.note} onChange={e=>edit(t.id,'note',e.target.value)} rows={3} maxLength={3000} placeholder="例如：先確認現有 Node 映像與可寫磁碟；若不符合，再評估其他路徑。"/></label></fieldset>)}</div>
        <button className={styles.action} onClick={download}>下載討論草稿 ↓</button><p role="status" className={styles.downloadStatus}>{notice}</p>
        <aside className={styles.prompt}><span>下一輪的交付</span><p>共同形成內部 v1 → 帶給 FDE 與一個核心 Consumer → 依挑戰修正 v2。</p><small>能力交付、整合完成、真正採用是不同的進度；接入缺口仍需共同處理。</small></aside>
      </>}
    </section>
    <footer className={styles.footer}><button disabled={step===0} onClick={()=>go(step-1)}>← 上一段</button><span>{step+1} / {steps.length}</span>{step<3?<button className={styles.action} onClick={()=>go(step+1)}>{steps[step+1]} →</button>:<button onClick={()=>go(0)}>回到現況</button>}</footer>
  </main>;
}
