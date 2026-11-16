import {DatabaseSync} from 'node:sqlite';

// Search SQL, normalization, predicates, sort and tag reuse match K2 verbatim.
// Only timers and a separate EXPLAIN operation are added.
const startupBegan = performance.now();
const db = new DatabaseSync(process.argv[2], {readOnly: true});
db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-8192; PRAGMA mmap_size=0;');
const snapshotId = db.prepare('SELECT snapshotId FROM metadata').get().snapshotId;
const segmenter = new Intl.Segmenter('zh-Hant', {granularity: 'word'});
const normalize = text => text.replace(/\p{Script=Han}+/gu, run => [...segmenter.segment(run)].map(x => x.segment).join(' '));
const pageStmt = db.prepare('SELECT * FROM pages WHERE pageId=?');
const tagsPrepareStarted = performance.now();
const tagsStmt = db.prepare('SELECT tagId FROM page_tags WHERE pageId=? ORDER BY tagId');
const tagsPrepareMs = performance.now() - tagsPrepareStarted;
const mediaStmt = db.prepare('SELECT * FROM media WHERE mediaId=?');
const sqliteVersion = db.prepare('SELECT sqlite_version() AS version').get().version;
const pragmas = {queryOnly: db.prepare('PRAGMA query_only').get().query_only,
  cacheSize: db.prepare('PRAGMA cache_size').get().cache_size,
  mmapSize: db.prepare('PRAGMA mmap_size').get().mmap_size};
process.send({ready: true, snapshotId, pid: process.pid, nodeVersion: process.version, sqliteVersion,
  pragmas, startup: {elapsedMs: performance.now() - startupBegan, tagsPrepareMs}, resourceUsage: process.resourceUsage()});

process.on('message', ({id, op, input}) => {
  const started = performance.now();
  const timings = {count: {prepareMs: 0, executeMs: 0}, top10: {prepareMs: 0, executeMs: 0},
    tags: {prepareMs: 0, executeMs: 0, lookupCount: 0, statementReusedFromStartup: true}};
  try {
    let result;
    if (op === 'check') result = db.prepare('PRAGMA quick_check').all();
    else if (op === 'page') {
      const page = pageStmt.get(input.pageId);
      result = page ? {...page, tagIds: tagsStmt.all(input.pageId).map(x => x.tagId), media: page.mediaId ? mediaStmt.get(page.mediaId) : null} : null;
    } else if (op === 'search' || op === 'explain') {
      const terms = normalize(input.q).match(/[\p{L}\p{N}\p{M}]+/gu);
      if (!terms?.length) throw Error('INVALID_QUERY');
      const match = terms.map(x => '"' + x + '"').join(' AND ');
      const filters = ['search_index MATCH ?'];const params = [match];
      if (input.identity === 'none') {result = {total: 0, hits: []};}
      else {
        if (input.identity === 'a') {filters.push('p.spaceId=?');params.push('space0');}
        if (input.spaceId) {filters.push('p.spaceId=?');params.push(input.spaceId);}
        for (const tag of input.tags) {filters.push('EXISTS (SELECT 1 FROM page_tags t WHERE t.pageId=p.pageId AND t.tagId=?)');params.push(tag);}
        const from = ' FROM search_index JOIN pages p ON p.rowid=search_index.rowid WHERE ' + filters.join(' AND ');
        const countSql = 'SELECT count(*) AS n' + from;
        const top10Sql = 'SELECT p.pageId,p.spaceId,p.title,substr(p.content,1,160) AS snippet' + from + ' ORDER BY bm25(search_index,3.0,1.0),p.pageId LIMIT 10';
        const tagsSql = 'SELECT tagId FROM page_tags WHERE pageId=? ORDER BY tagId';
        if (op === 'explain') {
          result = {
            count: {sql: countSql, parameters: params, plan: db.prepare('EXPLAIN QUERY PLAN ' + countSql).all(...params)},
            top10: {sql: top10Sql, parameters: params, plan: db.prepare('EXPLAIN QUERY PLAN ' + top10Sql).all(...params)},
            tags: {sql: tagsSql, parameters: [input.representativePageId ?? 'p000001'],
              plan: db.prepare('EXPLAIN QUERY PLAN ' + tagsSql).all(input.representativePageId ?? 'p000001')},
          };
        } else {
          let mark = performance.now();const count = db.prepare(countSql);timings.count.prepareMs = performance.now() - mark;
          mark = performance.now();const total = count.get(...params).n;timings.count.executeMs = performance.now() - mark;
          mark = performance.now();const top10 = db.prepare(top10Sql);timings.top10.prepareMs = performance.now() - mark;
          mark = performance.now();const hits = top10.all(...params);timings.top10.executeMs = performance.now() - mark;
          mark = performance.now();
          for (const hit of hits) hit.tagIds = tagsStmt.all(hit.pageId).map(x => x.tagId);
          timings.tags.executeMs = performance.now() - mark;timings.tags.lookupCount = hits.length;
          result = {total, hits};
        }
      }
    } else throw Error('UNKNOWN_OP');
    const workerMs = performance.now() - started;
    process.send({id, result, workerMs, timings, resourceUsage: process.resourceUsage()});
  } catch (error) {
    process.send({id, error: error.message, workerMs: performance.now() - started, timings, resourceUsage: process.resourceUsage()});
  }
});
