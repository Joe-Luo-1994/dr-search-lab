import {lstatSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {normalizeQuery} from './reference/normalize-query.mjs';
import {snapshotDir} from './settings.mjs';

const {q, spaces, tags, snapshotId, sourceSha256} = JSON.parse(process.argv[2]);
const terms = normalizeQuery(q).match(/[\p{L}\p{N}\p{M}]+/gu);
if (!terms?.length || !spaces.length) throw new Error('E1_INVALID_SQLITE_QUERY');
const match = terms.map(term => '"' + term + '"').join(' AND ');
const dbPath = path.join(snapshotDir, 'search.sqlite');
if (!lstatSync(dbPath).isFile()) throw new Error('E1_UNSAFE_SQLITE_FILE');
const database = new DatabaseSync(dbPath, {readOnly: true});
try {
  database.exec('PRAGMA query_only=ON; BEGIN;');
  const metadata = database.prepare('SELECT snapshotId, sourceSha256 FROM metadata').get();
  if (metadata?.snapshotId !== snapshotId || metadata.sourceSha256 !== sourceSha256) {
    throw new Error('E1_SQLITE_SNAPSHOT_MISMATCH');
  }

  // Keep every Space and Tag predicate inside the common count/rank input.
  const filter = `
    FROM search_index
    JOIN pages p ON p.rowid = search_index.rowid
    WHERE search_index MATCH ?
      AND p.spaceId IN (${spaces.map(() => '?').join(', ')})
      ${tags.map(() =>
        'AND EXISTS (SELECT 1 FROM page_tags t WHERE t.pageRowId = p.rowid AND t.tagId = ?)').join('\n')}
  `;
  const parameters = [match, ...spaces, ...tags];
  const {total} = database.prepare('SELECT count(*) AS total ' + filter).get(...parameters);
  const rows = database.prepare(`
    SELECT p.pageId ${filter}
    ORDER BY bm25(search_index, 3.0, 1.0), p.pageId
    LIMIT 10
  `).all(...parameters);
  process.stdout.write(JSON.stringify({total, pageIds: rows.map(row => row.pageId)}));
} finally {
  database.close();
}
