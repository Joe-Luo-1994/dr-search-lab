import { randomUUID } from 'node:crypto';
import { users, spaces, tagIds as knownTags, scenarios } from './dataset.mjs';
import { readDataset, readManifest, verifyArtifacts } from './artifacts.mjs';
import { engines, engineStatus, runEngine, externalConfig } from './engines.mjs';

export class LabError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function newState() { return { user: 'alice', version: 'v1', revoked: [], rebacDown: false, rebacLatency: 0, events: [] }; }
const sessions = globalThis.__drLabSessions ||= new Map();
export function session(cookie) {
  const id = cookie?.match(/(?:^|;\s*)dr-lab=([a-f0-9-]+)/)?.[1];
  if (id && sessions.has(id)) { const record = sessions.get(id); record.at = Date.now(); return { id, state: record.state }; }
  for (const [key, record] of sessions) if (Date.now() - record.at > 86400000) sessions.delete(key);
  if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value);
  const next = randomUUID(), state = newState(); sessions.set(next, { state, at: Date.now() }); return { id: next, state };
}
export function validateQuery(raw) {
  const keyword = raw.keyword ?? '';
  if (typeof keyword !== 'string' || keyword.length > 200) throw new LabError('keyword 上限 200 字元');
  const spaceId = raw.spaceId || '';
  if (spaceId && !spaces.some(s => s.id === spaceId)) throw new LabError('未知 Space');
  if (raw.tagIds !== undefined && !Array.isArray(raw.tagIds)) throw new LabError('tagIds 必須為陣列');
  const tags = [...new Set(raw.tagIds ?? [])];
  if (tags.some(t => !knownTags.includes(t))) throw new LabError('未知 Tag');
  const page = raw.page ?? 1, pageSize = raw.pageSize ?? 10;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || page * pageSize > 10000) throw new LabError('分頁上限 10,000；每頁 1..100');
  if (raw.includeAttachments !== undefined && typeof raw.includeAttachments !== 'boolean') throw new LabError('includeAttachments 必須為 boolean');
  return { keyword, spaceId, tagIds: tags, page, pageSize, includeAttachments: raw.includeAttachments ?? false };
}
async function authorize(state) {
  const t = performance.now();
  if (state.rebacLatency) await new Promise(resolve => setTimeout(resolve, state.rebacLatency));
  if (state.rebacDown) throw new LabError('模擬 ReBAC 不可用：拒絕搜尋／閱讀／下載，不以空結果假裝成功', 503);
  const allowedSpaces = users[state.user].spaces.filter(s => !state.revoked.includes(s));
  return { allowedSpaces, authMs: performance.now() - t };
}
export async function searchLab(state, engine, raw) {
  const t = performance.now();
  const q = validateQuery(raw);
  const snapshot = { ...state, revoked: [...state.revoked] };
  if (!engines.some(e => e.id === engine)) throw new LabError('未知引擎');
  const auth = await authorize(snapshot);
  const allowedSpaces = auth.allowedSpaces.filter(s => !q.spaceId || s === q.spaceId);
  const result = await runEngine(engine, { ...q, version: snapshot.version, allowedSpaces });
  const data = await readDataset(snapshot.version);
  const byId = new Map(data.pages.map(p => [p.id, p]));
  const hits = result.hits.map(h => {
    const p = byId.get(h.id);
    if (!p || !allowedSpaces.includes(p.spaceId) || !q.tagIds.every(t => p.tagIds.includes(t))) throw new LabError('索引／metadata 不一致，拒絕交付結果', 503);
    return { id: p.id, title: p.title, spaceId: p.spaceId, tagIds: p.tagIds, score: h.score, version: p.version };
  });
  return { engine, version: snapshot.version, synthetic: true, query: q, hits, total: result.total, totalRelation: result.totalRelation,
    metrics: { authMs: auth.authMs, loadMs: result.loadMs, searchMs: result.searchMs, apiMs: performance.now() - t },
    warnings: ['合成資料；結果分數不能跨引擎比較', ...(snapshot.version === 'v1' ? ['v1 的 Page 歸屬可能過時；即時 ReBAC 無法修正舊關聯'] : [])] };
}
export async function readPage(state, id, mediaId) {
  const snapshot = { ...state, revoked: [...state.revoked] };
  const { allowedSpaces } = await authorize(snapshot);
  const data = await readDataset(snapshot.version);
  const page = data.pages.find(p => p.id === id);
  if (!page || !allowedSpaces.includes(page.spaceId)) throw new LabError('找不到或無權存取', 404);
  if (mediaId && !page.mediaIds.includes(mediaId)) throw new LabError('Media 不屬於指定 Page', 403);
  return mediaId ? { filename: `${mediaId}.txt`, content: `Synthetic media ${mediaId}\nPage ${page.id}\nVersion ${snapshot.version}\n` } : page;
}
export async function control(state, body) {
  if (body.action === 'user') { if (!users[body.user]) throw new LabError('未知使用者'); state.user = body.user; }
  else if (body.action === 'revoke') { if (!spaces.some(s => s.id === body.spaceId)) throw new LabError('未知 Space'); state.revoked = [...new Set([...state.revoked, body.spaceId])]; }
  else if (body.action === 'rebac') { if (typeof body.down !== 'boolean') throw new LabError('down 必須為 boolean'); state.rebacDown = body.down; }
  else if (body.action === 'latency') { if (![0, 50, 200].includes(body.ms)) throw new LabError('延遲限 0/50/200ms'); state.rebacLatency = body.ms; }
  else if (body.action === 'publish') {
    if (!['v1', 'v2'].includes(body.version)) throw new LabError('未知版本');
    const t = performance.now();
    if (body.simulateFailure) throw new LabError('模擬同步驗證失敗；目前版本保持不變', 409);
    await verifyArtifacts(body.version); await readDataset(body.version);
    if (externalConfig('elasticsearch')) {
      const { verifyElasticRelease } = await import('./es-release.mjs');
      await verifyElasticRelease(body.version, false);
      await verifyElasticRelease(body.version, true);
    }
    state.version = body.version;
    state.events.unshift({ at: new Date().toISOString(), message: `發布 ${body.version}；本地 checksum 驗證 ${(performance.now() - t).toFixed(1)}ms（非完整 RTO）` });
  } else if (body.action === 'reset') Object.assign(state, newState());
  else throw new LabError('未知控制操作');
  state.events = state.events.slice(0, 10);
  return state;
}
export async function status(state) {
  let manifest = null;
  try { manifest = await readManifest(); } catch {}
  return { state, engines: await engineStatus(state.version), users, spaces, tagIds: knownTags, scenarios, manifest,
    limitations: ['身分切換與 ReBAC 是本機教學模擬，不是正式登入', '索引／Media 使用本機檔案，尚未接 MinIO', '跨區傳輸、DNS 切換、正式 RTO 尚未演練', '外部 adapter 未連線者不計入測試結果'] };
}
