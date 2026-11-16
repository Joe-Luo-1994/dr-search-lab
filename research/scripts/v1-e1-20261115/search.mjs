import {execFile} from 'node:child_process';
import path from 'node:path';
import {promisify} from 'node:util';

const execute = promisify(execFile);
let sqliteChildren = 0;

async function querySqlite(input, signal) {
  if (sqliteChildren >= 4) throw new Error('E1_SQLITE_BUSY');
  sqliteChildren++;
  try {
    const program = path.join(process.env.V1_E1_SCRIPT_ROOT, 'sqlite-search.mjs');
    const {stdout} = await execute(process.execPath, [program, JSON.stringify(input)], {
      signal, windowsHide: true, maxBuffer: 64 * 1024,
    });
    return JSON.parse(stdout);
  } finally {
    sqliteChildren--;
  }
}

async function queryEs({q, spaces, tags, snapshotId, sourceSha256}, signal) {
  const endpoint = process.env.V1_E1_ES_ENDPOINT;
  const response = await fetch(endpoint + '/_search?allow_partial_search_results=false', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    signal,
    redirect: 'error',
    body: JSON.stringify({
      size: 10,
      track_total_hits: true,
      timeout: '3s',
      _source: ['pageId'],
      query: {bool: {
        filter: [
          {terms: {spaceId: spaces}},
          {term: {snapshotId}},
          {term: {sourceSha256}},
          ...tags.map(tagId => ({term: {tagIds: tagId}})),
        ],
        must: q.split(/\s+/u).map(term => ({
          multi_match: {query: term, fields: ['title^3', 'content'], type: 'cross_fields', operator: 'and'},
        })),
      }},
      sort: [{_score: 'desc'}, {pageId: 'asc'}],
    }),
  });
  if (!response.ok) throw new Error('E1_ES_HTTP_' + response.status);
  const data = await response.json();
  if (data.timed_out || data._shards?.failed || data.hits?.total?.relation !== 'eq') {
    throw new Error('E1_ES_INCOMPLETE_RESULT');
  }
  return {total: data.hits.total.value, pageIds: data.hits.hits.map(hit => hit._source.pageId)};
}

export function queryProvider(input, signal) {
  switch (process.env.V1_E1_PROVIDER) {
    case 'b': return queryEs(input, signal);
    case 'c': return querySqlite(input, signal);
    default: throw new Error('E1_PROVIDER_NOT_CONFIGURED');
  }
}
