'use client';

import {useCallback, useEffect, useRef, useState} from 'react';

const spaces = {'space-a': '設備維運', 'space-b': '合作站點'};
const tags = {runbook: '手冊', validated: '已驗證', contact: '交接資料'};
const errors = {
  INVALID_REQUEST: '請輸入 1 到 120 字的搜尋字詞。',
  AUTHORIZATION_UNKNOWN: '目前無法確認存取權限。請檢查研究身份或稍後再試。',
  NOT_FOUND: '找不到這個頁面或附件。請返回搜尋結果。',
  SEARCH_UNAVAILABLE: '搜尋服務暫時無法使用。請稍後再試。',
  SNAPSHOT_UNAVAILABLE: '目前無法讀取資料快照。請稍後再試。',
  CONTENT_UNAVAILABLE: '目前無法讀取頁面正文。你仍可搜尋。',
  MEDIA_UNAVAILABLE: '目前無法載入這份 PDF。',
  CONTENT_INTEGRITY_MISMATCH: '資料快照的內容無法驗證。',
  VERSION_REQUIRED: '這個連結缺少版本。請重新搜尋。',
  REQUEST_TIMEOUT: '要求逾時，請稍後再試。',
};

async function request(url, identity, signal) {
  const response = await fetch(url, {
    headers: {'x-e1-identity': identity}, cache: 'no-store', signal,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error?.code ?? 'REQUEST_FAILED');
  }
  return response;
}

function Labels({item}) {
  return <ul className="labels" aria-label="Space 和 Tags">
    <li>{spaces[item.spaceId]}</li>
    {item.tagIds.map(tag => <li key={tag}>{tags[tag]}</li>)}
  </ul>;
}

export default function Page() {
  const [identity, setIdentity] = useState('a');
  const [query, setQuery] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(null);
  const [media, setMedia] = useState([]);
  const [pdf, setPdf] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const [versionChanged, setVersionChanged] = useState(false);
  const [releaseStatus, setReleaseStatus] = useState(null);
  const [statusError, setStatusError] = useState(false);
  const activeRequest = useRef(null);
  const heading = useRef(null);
  const lastResult = useRef(null);
  const lastSearch = useRef(null);
  const retry = useRef(null);
  const contentRetry = useRef(null);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/status', {cache: 'no-store', signal: AbortSignal.timeout(5_000)});
      if (!response.ok) throw new Error('STATUS_UNAVAILABLE');
      setReleaseStatus(await response.json());
      setStatusError(false);
    } catch {
      setReleaseStatus(null);
      setStatusError(true);
    }
  }, []);

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => { refreshStatus(); }, [refreshStatus]);
  useEffect(() => {
    if (page) heading.current?.focus();
  }, [page]);
  useEffect(() => {
    if (versionChanged) retry.current?.focus();
  }, [versionChanged]);
  useEffect(() => {
    if (error?.retry) contentRetry.current?.focus();
  }, [error]);
  useEffect(() => () => {
    if (pdf) URL.revokeObjectURL(pdf.url);
  }, [pdf]);

  function clearPage() {
    setPage(null);
    setMedia([]);
    setPdf(null);
  }

  async function run(message, work, retryAction) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(5_000);
    const signal = AbortSignal.any([controller.signal, timeout]);
    activeRequest.current = controller;
    setError(null);
    setBusy(message);
    try {
      await work(signal);
    } catch (cause) {
      if (!controller.signal.aborted) {
        const code = timeout.aborted ? 'REQUEST_TIMEOUT' : cause.message;
        if (code === 'VERSION_MISMATCH') {
          clearPage();
          setResult(null);
          setVersionChanged(true);
          refreshStatus();
        } else {
          setError({
            message: errors[code] ?? '要求目前無法完成。請稍後再試。',
            retry: code === retryAction?.code ? retryAction : null,
          });
        }
      }
    } finally {
      if (activeRequest.current === controller) setBusy('');
    }
  }

  function changeIdentity(event) {
    activeRequest.current?.abort();
    activeRequest.current = null;
    clearPage();
    setIdentity(event.target.value);
    setResult(null);
    setBusy('');
    setError(null);
    setVersionChanged(false);
    lastSearch.current = null;
  }

  function search(event) {
    event.preventDefault();
    const params = new URLSearchParams({q: query});
    if (spaceId) params.set('spaceId', spaceId);
    selectedTags.forEach(id => params.append('tagId', id));
    lastSearch.current = params.toString();
    performSearch(lastSearch.current);
  }

  function performSearch(params) {
    setResult(null);
    setVersionChanged(false);
    clearPage();
    run('搜尋中…', async signal => {
      const response = await request('/api/search?' + params, identity, signal);
      const data = await response.json();
      if (!signal.aborted) setResult(data);
    });
  }

  function openPage(hit) {
    lastResult.current = hit.pageId;
    run('載入頁面…', async signal => {
      const document = await request(hit.url, identity, signal).then(response => response.json());
      const attachments = await request(document.page.mediaUrl, identity, signal).then(response => response.json());
      if (!signal.aborted) {
        setPage(document.page);
        setMedia(attachments.media);
        setPdf(null);
      }
    }, {code: 'CONTENT_UNAVAILABLE', label: '重試載入頁面', run: () => openPage(hit)});
  }

  function back() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    clearPage();
    setBusy('');
    setError(null);
    requestAnimationFrame(() => document.getElementById('result-' + lastResult.current)?.focus());
  }

  function loadPdf(item) {
    setPdf(null);
    run('載入 PDF…', async signal => {
      const response = await request(item.url, identity, signal);
      const blob = await response.blob();
      if (!signal.aborted) setPdf({url: URL.createObjectURL(blob), fileName: item.fileName});
    }, {code: 'MEDIA_UNAVAILABLE', label: '重試載入 PDF', run: () => loadPdf(item)});
  }

  return <main>
    <header className="masthead">
      <div>
        <h1>異地唯讀搜尋</h1>
        <p>合成資料研究環境</p>
      </div>
      <label className="identity">
        研究身份
        <select value={identity} onChange={changeIdentity}>
          <option value="a">a · 設備維運</option>
          <option value="b">b · 合作站點</option>
          <option value="all">all · 兩個 Space</option>
          <option value="none">none · 無授權</option>
          <option value="unknown">unknown · 權限未知</option>
        </select>
      </label>
    </header>

    <section className="release-status" aria-label="資料快照與安裝狀態">
      <button type="button" onClick={refreshStatus}>更新狀態</button>
      {statusError && <p role="status">目前無法讀取安裝狀態。</p>}
      {releaseStatus && <dl>
        <dt>快照版本</dt><dd>{releaseStatus.snapshotId}</dd>
        <dt>來源快照時間</dt><dd><time dateTime={releaseStatus.snapshotCapturedAt}>{releaseStatus.snapshotCapturedAt}</time></dd>
        <dt>本機最近成功安裝</dt><dd>{releaseStatus.lastSuccessfulInstallation
          ? <>{releaseStatus.lastSuccessfulInstallation.snapshotId}{' '}
            <time dateTime={releaseStatus.lastSuccessfulInstallation.installedAt}>{releaseStatus.lastSuccessfulInstallation.installedAt}</time></>
          : '尚無紀錄'}</dd>
        <dt>最近安裝嘗試</dt><dd>{releaseStatus.latestAttempt?.state === 'failed'
          ? <span className="install-failure">{releaseStatus.latestAttempt.snapshotId} 失敗（{releaseStatus.latestAttempt.code}）</span>
          : releaseStatus.latestAttempt?.state === 'installing' ? '安裝中' : releaseStatus.latestAttempt ? '完成' : '尚無紀錄'}</dd>
      </dl>}
    </section>

    {!page && <form onSubmit={search} className="search">
      <label htmlFor="q">搜尋頁面或 PDF 文字</label>
      <div className="search-row">
        <input id="q" type="search" required value={query} onChange={event => setQuery(event.target.value)} />
        <button className="primary" type="submit" disabled={!!busy}>搜尋</button>
      </div>
      <div className="filters">
        <label className="space">
          Space
          <select value={spaceId} onChange={event => setSpaceId(event.target.value)}>
            <option value="">所有可存取 Space</option>
            {Object.entries(spaces).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>Tags（符合全部勾選項目）</legend>
          <div className="tag-options">
            {Object.entries(tags).map(([id, label]) => <label key={id}>
              <input type="checkbox" checked={selectedTags.includes(id)} onChange={event =>
                setSelectedTags(current => event.target.checked ? [...current, id] : current.filter(tag => tag !== id))} />
              {label}
            </label>)}
          </div>
        </fieldset>
      </div>
    </form>}

    <div role="status">{busy}</div>
    {error && <div className="error">
      <p id="content-error-message" role="alert">{error.message}</p>
      {error.retry && <button type="button" ref={contentRetry} aria-describedby="content-error-message"
        onClick={error.retry.run}>{error.retry.label}</button>}
    </div>}
    {versionChanged && <div className="error">
      <p role="alert">資料版本已更新。請重新搜尋以開啟目前版本的頁面與附件。</p>
      <button type="button" ref={retry} onClick={() => performSearch(lastSearch.current)}>重新搜尋</button>
    </div>}
    {!page && result && <section aria-labelledby="results">
      <h2 id="results">{result.total ? '搜尋結果（' + result.total + ' 筆）' : '沒有符合的頁面'}</h2>
      {result.total > 10 && <p>顯示前 10 筆。</p>}
      <p className="snapshot">快照時間 <time dateTime={result.snapshotCapturedAt}>{result.snapshotCapturedAt}</time></p>
      <ul className="results">
        {result.hits.map(hit => <li key={hit.pageId}>
          <button className="result-link" type="button" id={'result-' + hit.pageId}
            onClick={() => openPage(hit)} disabled={!!busy}>{hit.title}</button>
          <Labels item={hit} />
          <p>{hit.snippet}</p>
        </li>)}
      </ul>
    </section>}
    {page && <article>
      <button className="back" type="button" onClick={back}>← 返回搜尋結果</button>
      <h2 tabIndex={-1} ref={heading}>{page.title}</h2>
      <Labels item={page} />
      <p className="snapshot">快照時間 <time dateTime={result.snapshotCapturedAt}>{result.snapshotCapturedAt}</time></p>
      <div className="body-copy">{page.body.split('\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
      {media.length > 0 && <section aria-labelledby="attachments">
        <h3 id="attachments">頁面附件</h3>
        <ul className="attachments">
          {media.map(item => <li key={item.mediaId}>
            <button type="button" onClick={() => loadPdf(item)} disabled={!!busy}>載入 {item.fileName}</button>
          </li>)}
        </ul>
        {pdf && <div className="preview">
          <div className="pdf-links">
            <a href={pdf.url} target="_blank" rel="noopener noreferrer">在新分頁開啟 PDF</a>
            <a href={pdf.url} download={pdf.fileName}>下載 PDF</a>
          </div>
          <iframe title={'PDF 預覽 · ' + pdf.fileName} src={pdf.url} />
        </div>}
      </section>}
    </article>}
  </main>;
}
