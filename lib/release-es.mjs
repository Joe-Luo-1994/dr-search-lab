// Read-only ES adapter for the release-closure experiment, not a production API.
export function releaseES(baseURL, trace = []) {
  const base = new URL(baseURL);
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw Error('Experiment requires a credential-free loopback ES URL');
  async function request(index, suffix, body) {
    if (!/^drlab-[a-z0-9-]+$/.test(index) || !['_mapping', '_settings', '_search'].includes(suffix)) throw Error('Read-only ES operation required');
    trace.push({ index, operation: suffix, method: body ? 'POST' : 'GET' });
    const response = await fetch(new URL(`/${index}/${suffix}`, base), {
      method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw Error(`ES returned ${response.status}`);
    const data = await response.json();
    if (data.timed_out || data._shards?.failed) throw Error('Partial ES result rejected');
    return data;
  }
  return {
    async inspect(index) {
      const mapping = await request(index, '_mapping');
      const meta = mapping[index]?.mappings?._meta;
      if (meta?.lab !== 'dr-search') throw Error('Unexpected ES metadata');
      const settings = await request(index, '_settings');
      const documents = []; let after;
      for (;;) {
        const result = await request(index, '_search', { size: 500, query: { match_all: {} }, sort: [{ id: 'asc' }], ...(after ? { search_after: after } : {}) });
        documents.push(...result.hits.hits.map(h => h._source));
        if (result.hits.hits.length < 500) break;
        after = result.hits.hits.at(-1).sort;
      }
      return { version: meta.version, attachments: meta.attachments, digest: meta.digest, documents, writeBlocked: String(settings[index]?.settings?.index?.blocks?.write) === 'true' };
    },
    async search(index, { keyword, tagIds, page, pageSize, allowedSpaces }) {
      const data = await request(index, '_search', {
        from: (page - 1) * pageSize, size: pageSize, track_total_hits: true,
        sort: [{ _score: 'desc' }, { id: 'asc' }],
        query: { bool: { must: keyword.trim() ? [{ multi_match: { query: keyword, fields: ['title^2', 'body'] } }] : [{ match_all: {} }],
          filter: [{ terms: { spaceId: allowedSpaces } }, ...tagIds.map(tag => ({ term: { tagIds: tag } }))] } }
      });
      if (data.hits?.total?.relation !== 'eq') throw Error('Inexact ES total rejected');
      return { total: data.hits.total.value, hits: data.hits.hits.map(h => ({ id: h._source.id, score: h._score })) };
    }
  };
}
