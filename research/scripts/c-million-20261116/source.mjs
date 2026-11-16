// Deterministic source specification and independent expectations for K2.
// This module never imports SQLite, reader code, or generated DB results.
export const seed = 'c-capacity-20261115-deterministic-v1';
export const sourceContract = 'c-million-20261116-source-v1';

function validCount(count) {
  if (!Number.isSafeInteger(count) || count < 10 || count > 1000000) throw Error('INVALID_SOURCE_COUNT');
}
function validVersion(version) {
  if (version !== 'v1' && version !== 'v2') throw Error('INVALID_SOURCE_VERSION');
}
export function pageId(i) {
  if (!Number.isSafeInteger(i) || i < 1 || i > 1000001) throw Error('INVALID_PAGE_NUMBER');
  return 'p' + String(i).padStart(6, '0');
}
export function parsePageId(id, count, version) {
  validCount(count);validVersion(version);
  if (typeof id !== 'string' || !/^p\d{6,7}$/.test(id)) throw Error('INVALID_PAGE_ID');
  const i = Number(id.slice(1));
  if (i < 1 || i > count + (version === 'v2' ? 1 : 0) || pageId(i) !== id) throw Error('INVALID_PAGE_ID');
  return i;
}
export function snippet(content) {
  return Array.from(content).slice(0, 160).join('');
}

export function source(i, version, count) {
  validCount(count);validVersion(version);
  if (!Number.isSafeInteger(i) || i < 1 || i > count + (version === 'v2' ? 1 : 0)) throw Error('SOURCE_ROW_OUT_OF_RANGE');
  const id = pageId(i);
  let spaceId = i <= Math.floor(count / 2) ? 'space0' : 'space' + (1 + ((i - 1) % 99));
  let tags = ['t' + (i % 10), 't' + ((i + 1) % 10)];
  if (version === 'v2' && i === 1) spaceId = 'space1';
  if (version === 'v2' && i === 2) tags = ['t8', 't9'];
  const published = i <= Math.min(count, 256) || (version === 'v2' && i === count + 1);
  const mediaId = published ? 'm' + ((i - 1) % 8) : null;
  const title = `Knowledge page ${id}${version === 'v2' && i === 3 ? ' revised' : ''}`;
  const chinese = i % 5 === 0;
  // attachmentknowledge is deliberately also in body. It marks published pages;
  // it is NOT a PDF-only extraction oracle.
  const prefix = `disaster recovery unique${id} ${chinese ? '災難復原 知識管理 ' : ''}` +
    (published ? 'attachmentknowledge ' : '') + (version === 'v2' && i === 3 ? 'revisiontwo ' : 'revisionone ');
  const target = i % 100 === 0 ? 8 * 1024 : 1024;
  const needed = target - Buffer.byteLength(prefix);
  const content = prefix + (' reference'.repeat(Math.ceil(needed / 10))).slice(0, needed);
  if (Buffer.byteLength(content) !== target) throw Error('BODY_SIZE_ERROR');
  return {i, sourceCount: count, pageId: id, spaceId, tags, title, content, published, mediaId, chinese};
}

export function querySpecs(count) {
  validCount(count);
  return [
    {id: 'common', q: 'disaster', tags: [], identity: 'all'},
    {id: 'rare', q: 'unique' + pageId(Math.min(123, count)), tags: [], identity: 'all'},
    {id: 'chinese', q: '災難復原', tags: [], identity: 'all'},
    {id: 'space', q: 'disaster', spaceId: 'space1', tags: [], identity: 'all'},
    {id: 'tags', q: 'disaster', tags: ['t0', 't1'], identity: 'all'},
    {id: 'absent', q: 'thistermdoesnotexist', tags: [], identity: 'all'},
    {id: 'pdf', q: 'attachmentknowledge', tags: [], identity: 'all'},
    {id: 'restricted', q: 'disaster', tags: [], identity: 'a'},
    {id: 'restricted-tags', q: 'disaster', tags: ['t0', 't1'], identity: 'a'},
  ];
}

export function eligible(queryId, p) {
  switch (queryId) {
    case 'common': return true;
    case 'rare': return p.i === Math.min(123, p.sourceCount);
    case 'chinese': return p.chinese;
    case 'space': return p.spaceId === 'space1';
    case 'tags': return p.tags.includes('t0') && p.tags.includes('t1');
    case 'absent': return false;
    case 'pdf': return p.published;
    case 'restricted': return p.spaceId === 'space0';
    case 'restricted-tags': return p.spaceId === 'space0' && p.tags.includes('t0') && p.tags.includes('t1');
    default: throw Error('UNKNOWN_QUERY_SPEC');
  }
}
