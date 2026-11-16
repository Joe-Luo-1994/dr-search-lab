// G2 source oracle only. No Pagefind, adapter, SQL, or observed search output is
// used to manufacture expectations. MS1 formulas are frozen from the original
// scripts/ms1-review/corpus.mjs; small-fixture contract is independent of MS1.
export const ORACLE_CONTRACT = 'pagefind-g2-20261116-v1';
export const MS1_N = 100000;
export const MS1_RELEASE = 'ms1-v1';
export const SMALL_RELEASE = 'pf-g2-small-v1';

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const ms1Id = i => 'p' + String(i).padStart(9, '0');
export function ms1Index(id) {
  if (typeof id !== 'string' || !/^p\d{9}$/.test(id)) return NaN;
  const i = Number(id.slice(1));
  return i >= 0 && i < MS1_N && ms1Id(i) === id ? i : NaN;
}
export const ms1Space = i => i < Math.floor(MS1_N / 2) ? 's0000' :
  's' + String(1 + (i - Math.floor(MS1_N / 2)) % 999).padStart(4, '0');
export function ms1AllowedSpaces(user) {
  if (user === 'huge') return ['s0000'];
  if (user === 'small') return ['s0001'];
  if (user === 'pair') return ['s0001', 's0002'];
  if (user === 'dup') return ['s0001', 's0001', 's9999'];
  if (user === 'none') return [];
  if (user === 'multi') return Array.from({length: 10}, (_, i) => 's' + String(i + 1).padStart(4, '0'));
  if (user === 'many') return Array.from({length: 100}, (_, i) => 's' + String(i + 1).padStart(4, '0'));
  if (user === 'all') return Array.from({length: 1000}, (_, i) => 's' + String(i).padStart(4, '0'));
  return null;
}
export function ms1Matches(i, term) {
  if (term === 'commonterm') return true;
  if (term === 'rarebeacon') return i % 997 === 0;
  if (term === 'ERR_CONN_RESET') return i % 17 === 0;
  if (term === '備份' || term === '資料庫備份') return i % 19 === 0;
  if (term === 'absentquartz') return false;
  throw Error('UNFROZEN_MS1_QUERY');
}
export function ms1Source(i) {
  if (!Number.isInteger(i) || i < 0 || i >= MS1_N) throw Error('INVALID_MS1_SOURCE_ROW');
  const id = ms1Id(i), spaceId = ms1Space(i);
  const markers = ['commonterm', ...(i % 997 === 0 ? ['rarebeacon'] : []),
    ...(i % 17 === 0 ? ['ERR_CONN_RESET'] : []), ...(i % 19 === 0 ? ['資料庫備份流程與還原。'] : [])];
  const title = `Synthetic document ${id} topic${i % 97}`;
  let state = (Math.imul(i + 1, 2654435761) ^ 0x71ac3e29) >>> 0;
  const words = [], target = i % 100 === 0 ? 8192 : 1024;
  let length = Buffer.byteLength(markers.join(' ') + ' ');
  while (length < target) {
    state ^= state << 13;state ^= state >>> 17;state ^= state << 5;
    const word = 'vocab' + String((state >>> 0) % 65521);
    words.push(word);length += word.length + 1;
  }
  return {id, spaceId, tags: [], title, content: markers.join(' ') + ' ' + words.join(' ')};
}

function authExpectation(user, allowedFunction) {
  if (user === null || user === undefined || user === '') return {status: 401, errorCode: 'UNAUTHENTICATED'};
  if (user === 'unknown') return {status: 503, errorCode: 'AUTH_UNAVAILABLE'};
  if (allowedFunction(user) === null) return {status: 403, errorCode: 'FORBIDDEN'};
  return null;
}
function effectiveSpaces(request, allowedFunction) {
  const permitted = new Set(allowedFunction(request.user) ?? []);
  return request.spaces === undefined ? permitted : new Set(request.spaces.filter(s => permitted.has(s)));
}
function request(spec) {
  return {engine: 'pagefind', page: 1, pageSize: 10, ...spec};
}
function ms1Case(id, spec) {
  const r = request(spec), auth = authExpectation(r.user, ms1AllowedSpaces);
  if (auth) return {id, request: r, expected: auth};
  const scope = effectiveSpaces(r, ms1AllowedSpaces);
  let total = 0;
  const boundedIds = [];
  for (let i = 0; i < MS1_N; i++) if (scope.has(ms1Space(i)) && ms1Matches(i, r.q)) {
    total++;if (boundedIds.length < 11) boundedIds.push(ms1Id(i));
  }
  return {id, request: r, expected: {status: 200, total,
    ...(total <= r.pageSize && r.page === 1 ? {eligibleIds: boundedIds} : {}),
    hitCount: Math.max(0, Math.min(r.pageSize, total - (r.page - 1) * r.pageSize))}};
}
export const MS1_CASES = freeze([
  ms1Case('ms1-common-huge-page1', {user: 'huge', q: 'commonterm'}),
  ms1Case('ms1-common-huge-page2', {user: 'huge', q: 'commonterm', page: 2}),
  ms1Case('ms1-rare-single-space', {user: 'all', q: 'rarebeacon', spaces: ['s0848']}),
  ms1Case('ms1-chinese-short-huge', {user: 'huge', q: '備份'}),
  ms1Case('ms1-chinese-phrase-all', {user: 'all', q: '資料庫備份'}),
  ms1Case('ms1-code-small', {user: 'small', q: 'ERR_CONN_RESET'}),
  ms1Case('ms1-scope-intersection', {user: 'pair', q: 'commonterm', spaces: ['s0000', 's0002']}),
  ms1Case('ms1-no-permitted-space', {user: 'none', q: 'commonterm'}),
  ms1Case('ms1-auth-unknown', {user: 'unknown', q: 'commonterm'}),
  ms1Case('ms1-auth-missing', {user: null, q: 'commonterm'}),
  ms1Case('ms1-requested-forbidden-space', {user: 'huge', q: 'commonterm', spaces: ['s0001']}),
  ms1Case('ms1-absent', {user: 'all', q: 'absentquartz'}),
]);

export const SMALL_FIXTURE = freeze([
  {id: 'title-a', spaceId: 'space-a', tags: ['guide'], title: 'Titaniumneedle handbook', content: 'A title-only discovery case.', pdfExtracted: ''},
  {id: 'body-a', spaceId: 'space-a', tags: ['guide'], title: 'Operations memo', content: 'The cobaltneedle procedure is documented here.', pdfExtracted: ''},
  {id: 'body-b', spaceId: 'space-b', tags: ['guide'], title: 'Restricted operations memo', content: 'The cobaltneedle detail belongs to another Space.', pdfExtracted: ''},
  {id: 'pdf-a', spaceId: 'space-a', tags: ['manual'], title: 'Attached recovery manual', content: 'This page introduces an attachment.', pdfExtracted: 'Fossilquartz appears only in the already extracted PDF text.'},
  {id: 'english-a', spaceId: 'space-a', tags: ['manual'], title: 'Remote recovery notes', content: 'Use the resilienceplaybook to restore the service.', pdfExtracted: ''},
  {id: 'chinese-a', spaceId: 'space-a', tags: ['manual'], title: '資料庫備份操作', content: '每日執行備份並確認還原結果。', pdfExtracted: ''},
  {id: 'code-a', spaceId: 'space-a', tags: ['incident'], title: 'Connection incident', content: 'Investigate ERR_CONN_RESET during recovery.', pdfExtracted: ''},
  {id: 'tags-ab-a', spaceId: 'space-a', tags: ['red', 'blue'], title: 'Two-tag permitted guide', content: 'tagbeacon combines both labels.', pdfExtracted: ''},
  {id: 'tags-red-a', spaceId: 'space-a', tags: ['red'], title: 'Red-only guide', content: 'tagbeacon has only the red label.', pdfExtracted: ''},
  {id: 'tags-blue-a', spaceId: 'space-a', tags: ['blue'], title: 'Blue-only guide', content: 'tagbeacon has only the blue label.', pdfExtracted: ''},
  {id: 'tags-none-a', spaceId: 'space-a', tags: [], title: 'Unlabelled guide', content: 'tagbeacon has no labels.', pdfExtracted: ''},
  {id: 'tags-ab-b', spaceId: 'space-b', tags: ['red', 'blue'], title: 'Two-tag restricted guide', content: 'tagbeacon combines both labels in another Space.', pdfExtracted: ''},
]);
const smallById = new Map(SMALL_FIXTURE.map(p => [p.id, p]));
export function smallIndexText(p) {
  return p.content + (p.pdfExtracted ? '\n' + p.pdfExtracted : '');
}
export function smallAllowedSpaces(user) {
  if (user === 'a') return ['space-a'];
  if (user === 'b') return ['space-b'];
  if (user === 'all') return ['space-a', 'space-b'];
  if (user === 'none') return [];
  return null;
}
const smallQueryIds = freeze({
  titaniumneedle: ['title-a'], cobaltneedle: ['body-a', 'body-b'], fossilquartz: ['pdf-a'],
  resilienceplaybook: ['english-a'], '資料庫備份': ['chinese-a'], ERR_CONN_RESET: ['code-a'],
  tagbeacon: ['tags-ab-a', 'tags-red-a', 'tags-blue-a', 'tags-none-a', 'tags-ab-b'], absentquartz: [],
});
function smallCase(id, spec) {
  const r = request({tags: [], ...spec}), auth = authExpectation(r.user, smallAllowedSpaces);
  if (auth) return {id, request: r, expected: auth};
  const scope = effectiveSpaces(r, smallAllowedSpaces), queryIds = smallQueryIds[r.q];
  if (!queryIds) throw Error('UNFROZEN_SMALL_QUERY');
  const eligibleIds = queryIds.filter(id => {
    const p = smallById.get(id);
    return scope.has(p.spaceId) && r.tags.every(t => p.tags.includes(t));
  });
  return {id, request: r, expected: {status: 200, total: eligibleIds.length, eligibleIds,
    hitCount: Math.max(0, Math.min(r.pageSize, eligibleIds.length - (r.page - 1) * r.pageSize))}};
}
export const SMALL_CASES = freeze([
  smallCase('small-title-only', {user: 'a', q: 'titaniumneedle'}),
  smallCase('small-content-only', {user: 'a', q: 'cobaltneedle'}),
  smallCase('small-pdf-extracted-only', {user: 'a', q: 'fossilquartz'}),
  smallCase('small-english', {user: 'a', q: 'resilienceplaybook'}),
  smallCase('small-chinese', {user: 'a', q: '資料庫備份'}),
  smallCase('small-technical-code', {user: 'a', q: 'ERR_CONN_RESET'}),
  smallCase('small-tags-and-all', {user: 'all', q: 'tagbeacon', tags: ['red', 'blue']}),
  smallCase('small-tags-and-permitted', {user: 'a', q: 'tagbeacon', tags: ['red', 'blue']}),
  smallCase('small-single-red-counterexample', {user: 'a', q: 'tagbeacon', tags: ['red']}),
  smallCase('small-single-blue-counterexample', {user: 'a', q: 'tagbeacon', tags: ['blue']}),
  smallCase('small-space-and-tags', {user: 'all', q: 'tagbeacon', spaces: ['space-b'], tags: ['red', 'blue']}),
  smallCase('small-space-auth-intersection', {user: 'a', q: 'tagbeacon', spaces: ['space-a', 'space-b'], tags: ['red', 'blue']}),
  smallCase('small-forbidden-space', {user: 'a', q: 'tagbeacon', spaces: ['space-b']}),
  smallCase('small-no-permitted-space', {user: 'none', q: 'tagbeacon'}),
  smallCase('small-auth-unknown', {user: 'unknown', q: 'tagbeacon'}),
  smallCase('small-auth-missing', {user: null, q: 'tagbeacon'}),
  smallCase('small-auth-unrecognised', {user: 'unrecognised', q: 'tagbeacon'}),
  smallCase('small-absent', {user: 'all', q: 'absentquartz'}),
  smallCase('small-content-all-spaces', {user: 'all', q: 'cobaltneedle'}),
  smallCase('small-pdf-no-permission', {user: 'b', q: 'fossilquartz'}),
]);

// Request serialization is shared only as transport description, not search logic.
// Missing identity is represented by user:null and OMITTED x-lab-user, not "null".
// spaces and tags are comma-separated query strings; Tags require ALL values.
export function caseRequest(testCase, origin, pathname = '/api/research/search') {
  const url = new URL(pathname, origin), r = testCase.request;
  for (const name of ['engine', 'q', 'page', 'pageSize']) url.searchParams.set(name, String(r[name]));
  if (r.spaces !== undefined) url.searchParams.set('spaces', r.spaces.join(','));
  if (r.tags !== undefined && r.tags.length) url.searchParams.set('tags', r.tags.join(','));
  return {url: url.href, headers: r.user === null || r.user === undefined ? {} : {'x-lab-user': r.user}};
}

const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && new Set(a).size === a.length && a.every(x => b.includes(x));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function unknownFields(value, allowed, issues, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push(`${label}.unexpected:${key}`);
}
function envelope(testCase, response, release, issues) {
  const {expected, request: r} = testCase;
  if (response?.status !== expected.status) issues.push(`status:${response?.status} expected:${expected.status}`);
  const body = response?.body;
  if (!object(body)) {issues.push('body.not-object');return null;}
  if (expected.status !== 200) {
    unknownFields(body, ['error'], issues, 'body');
    if (!object(body.error) || body.error.code !== expected.errorCode || body.error.retryable !== (expected.status >= 500)) {
      issues.push('error.contract');
    } else unknownFields(body.error, ['code', 'retryable'], issues, 'error');
    return null;
  }
  unknownFields(body, ['schemaVersion', 'release', 'engine', 'page', 'pageSize', 'total', 'totalRelation',
    'capabilities', 'synthetic', 'hits', 'metrics'], issues, 'body');
  const fields = {schemaVersion: release, release, engine: 'pagefind', page: r.page, pageSize: r.pageSize,
    total: expected.total, totalRelation: 'exact', synthetic: true};
  for (const [key, value] of Object.entries(fields)) if (body[key] !== value) issues.push(`body.${key}`);
  if (!object(body.capabilities) || body.capabilities.highlight !== 'none' || Object.keys(body.capabilities).length !== 1) issues.push('capabilities');
  if (!object(body.metrics) || Object.values(body.metrics).some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) issues.push('metrics');
  else unknownFields(body.metrics, ['engineMs', 'mappingMs'], issues, 'metrics');
  if (!Array.isArray(body.hits)) {issues.push('hits.not-array');return null;}
  if (body.hits.length !== expected.hitCount) issues.push('hits.count');
  const ids = body.hits.map(h => h?.id);
  if (new Set(ids).size !== ids.length) issues.push('hits.duplicate');
  if (expected.eligibleIds && expected.total <= r.pageSize && r.page === 1 && !sameSet(ids, expected.eligibleIds)) issues.push('hits.full-set');
  return body.hits;
}
function sourceFields(hit, source, release, small, issues, index) {
  const label = `hits[${index}]`;
  if (!object(hit)) {issues.push(`${label}.not-object`);return;}
  const required = small ? ['id', 'spaceId', 'tags', 'title', 'url', 'highlight'] : ['id', 'title', 'content', 'url', 'highlight'];
  const optional = small ? ['content', 'pdfExtracted', 'snippet', 'pageId'] : ['spaceId', 'tags', 'snippet', 'pageId'];
  unknownFields(hit, [...required, ...optional], issues, label);
  for (const key of required) if (!owns(hit, key)) issues.push(`${label}.missing:${key}`);
  if (hit.id !== source.id || hit.title !== source.title || hit.highlight !== null ||
      hit.url !== `/api/research/pages/${source.id}?release=${release}`) issues.push(`${label}.identity/title/url/highlight`);
  if (owns(hit, 'spaceId') && hit.spaceId !== source.spaceId) issues.push(`${label}.spaceId`);
  if (owns(hit, 'tags') && !sameSet(hit.tags, source.tags)) issues.push(`${label}.tags`);
  if (owns(hit, 'pageId') && hit.pageId !== source.id) issues.push(`${label}.pageId`);
  if (owns(hit, 'content') && hit.content !== source.content) issues.push(`${label}.content`);
  if (owns(hit, 'pdfExtracted') && hit.pdfExtracted !== source.pdfExtracted) issues.push(`${label}.pdfExtracted`);
  if (owns(hit, 'snippet')) {
    const text = small ? smallIndexText(source) : source.content;
    if (typeof hit.snippet !== 'string' || !hit.snippet || !text.includes(hit.snippet)) issues.push(`${label}.snippet-source`);
  }
}
export function validateMs1Response(testCase, response) {
  const issues = [], hits = envelope(testCase, response, MS1_RELEASE, issues);
  if (hits) {
    const scope = effectiveSpaces(testCase.request, ms1AllowedSpaces);
    for (const [index, hit] of hits.entries()) {
      const i = ms1Index(hit?.id);
      if (!Number.isInteger(i)) {issues.push(`hits[${index}].unknown-id`);continue;}
      const p = ms1Source(i);
      if (!scope.has(p.spaceId) || !ms1Matches(i, testCase.request.q)) issues.push(`hits[${index}].ineligible`);
      sourceFields(hit, p, MS1_RELEASE, false, issues, index);
    }
  }
  return {passed: issues.length === 0, issues};
}
export function validateSmallResponse(testCase, response) {
  const issues = [], hits = envelope(testCase, response, SMALL_RELEASE, issues);
  if (hits) for (const [index, hit] of hits.entries()) {
    const p = smallById.get(hit?.id);
    if (!p) {issues.push(`hits[${index}].unknown-id`);continue;}
    if (!testCase.expected.eligibleIds.includes(p.id)) issues.push(`hits[${index}].ineligible`);
    sourceFields(hit, p, SMALL_RELEASE, true, issues, index);
  }
  return {passed: issues.length === 0, issues};
}
// Records are {id:case.id,response:{status,body}}. The two fixed common-term
// pages must not overlap. No expected ranking or equivalence to ES is assumed.
export function validateMs1Pagination(records) {
  const first = records.find(r => r.id === 'ms1-common-huge-page1')?.response;
  const second = records.find(r => r.id === 'ms1-common-huge-page2')?.response;
  const issues = [];
  if (first?.status !== 200 || second?.status !== 200 || !Array.isArray(first.body?.hits) || !Array.isArray(second.body?.hits)) {
    issues.push('pagination.two-successful-pages-required');
  } else {
    const ids = new Set(first.body.hits.map(h => h.id));
    if (second.body.hits.some(h => ids.has(h.id))) issues.push('pagination.overlap');
  }
  return {passed: issues.length === 0, issues};
}
