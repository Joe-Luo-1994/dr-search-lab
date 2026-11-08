import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import MiniSearch from 'minisearch';
import { create, load, search } from '@orama/orama';
import { root, variant, miniOptions, oramaSchema } from './artifacts.mjs';

export const engines = [
  { id: 'sqlite', name: 'SQLite FTS5', type: '嵌入式 · 磁碟', note: 'unicode61；空白詞 OR；中文連續字詞可能漏找；SQL 先篩選再分頁。' },
  { id: 'minisearch', name: 'MiniSearch', type: '嵌入式 · 記憶體', note: '預設斷詞；OR；Title 權重 2；未開模糊與前綴；callback 篩選。' },
  { id: 'orama', name: 'Orama', type: '嵌入式 · 記憶體', note: '預設英文 tokenizer；Title 權重 2；Space enum 與 Tags containsAll。未加中文外掛。' },
  { id: 'elasticsearch', name: 'Elasticsearch', type: '獨立服務', note: '參考設定：standard analyzer、multi_match、Title 權重 2；不是公司正式設定。' },
  { id: 'meilisearch', name: 'Meilisearch', type: '獨立服務', note: '預設排名／錯字行為；原生 AND 篩選。需要啟動並 provision。' },
  { id: 'typesense', name: 'Typesense', type: '獨立服務', note: '預設搜尋行為；原生 AND 篩選。需要啟動並 provision。' },
  { id: 'pagefind', name: 'Pagefind', type: '可行性待驗證', note: '尚未通過私有索引與伺服器 API 關卡，不產生搜尋結果。' },
];
const cache = new Map();
export function clearEngines() { for (const x of cache.values()) x.close?.(); cache.clear(); }
export function externalConfig(engine) {
  const names = { elasticsearch: 'ELASTICSEARCH_URL', meilisearch: 'MEILISEARCH_URL', typesense: 'TYPESENSE_URL' };
  const base = process.env[names[engine]];
  if (!base) return null;
  const headers = { 'content-type': 'application/json' };
  if (engine === 'meilisearch') headers.Authorization = `Bearer ${process.env.MEILISEARCH_KEY || 'dr-demo-local-only-key'}`;
  if (engine === 'typesense') headers['X-TYPESENSE-API-KEY'] = process.env.TYPESENSE_KEY || 'dr-demo-local-only-key';
  return { base: base.replace(/\/$/, ''), headers };
}
export async function remote(engine, endpoint, options = {}) {
  const config = externalConfig(engine);
  if (!config) throw new Error(`${engine}: 未設定服務 URL`);
  const { timeoutMs = 10000, ...fetchOptions } = options;
  const response = await fetch(config.base + endpoint, { ...fetchOptions, headers: { ...config.headers, ...options.headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${engine}: HTTP ${response.status}（確認服務及索引已 provision）`);
  return response.json();
}
export function indexName(version, attachments) {
  const prefix = process.env.LAB_INDEX_PREFIX || 'drlab-';
  if (!/^drlab-[a-z0-9-]*$/.test(prefix)) throw new Error('Invalid lab index prefix');
  return `${prefix}${variant(version, attachments)}`;
}
export function assertCompleteEsResponse(data) {
  if (data.timed_out || data._shards?.failed > 0 || data.hits?.total?.relation !== 'eq') throw new Error('Elasticsearch partial response rejected');
}
export async function engineStatus(version = 'v1') {
  return Promise.all(engines.map(async e => {
    if (e.id === 'pagefind') return { ...e, ready: false, reason: '尚未實作；不納入排名' };
    if (['sqlite', 'minisearch', 'orama'].includes(e.id)) {
      try { await readFile(path.join(root, 'manifest.json')); return { ...e, ready: true }; }
      catch { return { ...e, ready: false, reason: '先執行 npm run prepare:data' }; }
    }
    if (!externalConfig(e.id)) return { ...e, ready: false, reason: '未設定外部服務；adapter 已實作、尚待連線驗證' };
    try {
      if (e.id === 'elasticsearch') await remote(e.id, `/${indexName(version, false)}/_count`);
      if (e.id === 'meilisearch') await remote(e.id, `/indexes/${indexName('v1', false)}/stats`);
      if (e.id === 'typesense') await remote(e.id, `/collections/${indexName('v1', false)}`);
      return { ...e, ready: true };
    } catch (err) { return { ...e, ready: false, reason: err.message }; }
  }));
}

export async function runEngine(engine, q) {
  const { version, includeAttachments, allowedSpaces, tagIds, keyword, page, pageSize } = q;
  if (!engines.some(e => e.id === engine) || engine === 'pagefind') throw new Error('引擎尚未實作或不存在');
  const offset = (page - 1) * pageSize;
  if (!allowedSpaces.length) return { hits: [], total: 0, totalRelation: 'exact', loadMs: 0, searchMs: 0 };
  const key = variant(version, includeAttachments);
  const cacheKey = `${engine}:${key}`;
  let index = cache.get(cacheKey);
  let loadMs = 0;
  if (!index && ['sqlite', 'minisearch', 'orama'].includes(engine)) {
    const t = performance.now();
    if (engine === 'sqlite') index = new DatabaseSync(path.join(root, `${key}.sqlite`), { readOnly: true });
    if (engine === 'minisearch') index = MiniSearch.loadJSON(await readFile(path.join(root, `${key}.mini.json`), 'utf8'), miniOptions);
    if (engine === 'orama') { index = create({ schema: oramaSchema }); load(index, JSON.parse(await readFile(path.join(root, `${key}.orama.json`), 'utf8'))); }
    cache.set(cacheKey, index);
    loadMs = performance.now() - t;
  }
  const t = performance.now();
  let hits, total, totalRelation = 'exact';
  if (engine === 'sqlite') {
    const filters = [`p.spaceId IN (${allowedSpaces.map(() => '?').join(',')})`, ...tagIds.map(() => 'EXISTS (SELECT 1 FROM tags t WHERE t.pageId=p.id AND t.tag=?)')];
    const args = [...allowedSpaces, ...tagIds];
    const words = keyword.trim().split(/\s+/).filter(Boolean);
    const match = words.map(w => `"${w.replaceAll('"', '""')}"`).join(' OR ');
    const source = match ? 'text_index JOIN pages p ON p.id=text_index.id' : 'pages p';
    if (match) { filters.push('text_index MATCH ?'); args.push(match); }
    const where = filters.join(' AND ');
    total = index.prepare(`SELECT count(*) AS n FROM ${source} WHERE ${where}`).get(...args).n;
    hits = index.prepare(`SELECT p.id, ${match ? '-bm25(text_index,0,2,1)' : '0'} AS score FROM ${source} WHERE ${where} ORDER BY score DESC, p.id LIMIT ? OFFSET ?`).all(...args, pageSize, offset);
  } else if (engine === 'minisearch') {
    const all = index.search(keyword.trim() || MiniSearch.wildcard, { filter: r => allowedSpaces.includes(r.spaceId) && tagIds.every(t => r.tagIds.includes(t)), boost: { title: 2 } });
    all.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    total = all.length; hits = all.slice(offset, offset + pageSize).map(({ id, score }) => ({ id, score }));
  } else if (engine === 'orama') {
    // Omit text properties for filter-only requests: otherwise Orama excludes
    // documents without indexed text tokens even when no keyword was supplied.
    const result = await search(index, { ...(keyword.trim() ? { term: keyword, properties: ['title', 'body'], boost: { title: 2 } } : {}), where: { spaceId: { in: allowedSpaces }, ...(tagIds.length ? { tagIds: { containsAll: tagIds } } : {}) }, offset, limit: pageSize });
    total = result.count; hits = result.hits.map(h => ({ id: h.document.id, score: h.score }));
  } else if (engine === 'elasticsearch') {
    const data = await remote(engine, `/${indexName(version, includeAttachments)}/_search`, { method: 'POST', body: JSON.stringify({ from: offset, size: pageSize, track_total_hits: true, sort: [{ _score: 'desc' }, { id: 'asc' }], query: { bool: { must: keyword.trim() ? [{ multi_match: { query: keyword, fields: ['title^2', 'body'] } }] : [{ match_all: {} }], filter: [{ terms: { spaceId: allowedSpaces } }, ...tagIds.map(tag => ({ term: { tagIds: tag } }))] } } }) });
    assertCompleteEsResponse(data);
    hits = data.hits.hits.map(h => ({ id: h._source.id, score: h._score })); total = data.hits.total.value;
  } else if (engine === 'meilisearch') {
    const filter = [`spaceId IN [${allowedSpaces.map(s => JSON.stringify(s)).join(',')}]`, ...tagIds.map(t => `tagIds = ${JSON.stringify(t)}`)].join(' AND ');
    const data = await remote(engine, `/indexes/${indexName(version, includeAttachments)}/search`, { method: 'POST', body: JSON.stringify({ q: keyword, filter, offset, limit: pageSize, showRankingScore: true }) });
    hits = data.hits.map(h => ({ id: h.id, score: h._rankingScore })); total = data.estimatedTotalHits; totalRelation = 'estimated';
  } else if (engine === 'typesense') {
    // Values are strictly validated IDs, never arbitrary filter expressions.
    const filter = [`spaceId:=[${allowedSpaces.join(',')}]`, ...tagIds.map(t => `tagIds:=${t}`)].join(' && ');
    const params = new URLSearchParams({ q: keyword || '*', query_by: 'title,body', query_by_weights: '2,1', filter_by: filter, page: String(page), per_page: String(pageSize) });
    const data = await remote(engine, `/collections/${indexName(version, includeAttachments)}/documents/search?${params}`);
    hits = data.hits.map(h => ({ id: h.document.id, score: h.text_match })); total = data.found;
  }
  return { hits, total, totalRelation, loadMs, searchMs: performance.now() - t };
}
