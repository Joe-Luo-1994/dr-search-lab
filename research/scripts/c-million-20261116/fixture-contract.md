# K2 million-row fixture contract

Only K2 source/build files are new; K1 artifacts and source remain unchanged. `node fixture.mjs NEW_OUTDIR COUNT` refuses an existing output directory. COUNT is 10..1000000; intended instrumentation smoke is 1000 and formal dataset 1000000. A 100-row author smoke is permitted before formal work. No services are started by the builder.

## Compact, source-derived oracle

`source.mjs` exports `source(i,version,count)`, `querySpecs(count)`, `eligible(queryId,p)`, `snippet(content)`, `parsePageId(id,count,version)`, `pageId(i)`, `seed` and `sourceContract`. It imports no SQL, runtime, or generated data. The load generator reconstructs a returned hit using `source(parsePageId(hit.pageId,sourceCount,version),version,sourceCount)` and checks metadata plus `eligible(query.id,p)`. `snippet(p.content)` is the exact first 160 Unicode code points, independent of SQL. This module is a fixture source specification, not an alternate production search implementation. Runtime must not import the oracle module; its normalization implementation remains separate.

Oracle root has `{schemaVersion,seed,sourceContract,sourceCount,sourceOracle,rankingContract,versions:{v1,v2}}`. Each version has `{count,queries,pages,media,changes}`. Queries have `{id,q,spaceId?,tags,identity,total}`. There is **no eligibleIds array and no full searchPages array**. Builder computes totals by source predicates while visiting each row. Published page `pages` entries are `{pageId,spaceId,tags,title,mediaId,bodySha,bodyBytes,bodyKey}`; media entries contain mediaId and descriptor. Those bounded hot-set records remain useful for read/download payload checks.

Query classes remain K1: common, rare, chinese, space, tags, absent, pdf, restricted, restricted-tags. `pdf` uses attachmentknowledge, a marker present in BOTH body and PDF. It does not prove PDF-only extracted text indexing. Exact total and unique eligible Top10 plus exact returned metadata/snippet are required; BM25 order equivalence and user search quality remain unproven.

## Dataset and reader schema

Dataset rules, schema and normalization match K1. V1 has COUNT rows; V2 has COUNT+1. IDs have at least six decimal digits: p000001 through p999999, then p1000000/p1000001. `parsePageId` checks canonical encoding and version range, rejecting aliases such as p0000001 and out-of-range IDs. Space0 holds the first half; others spread over 99 Spaces. Two Tags per page (i%10, (i+1)%10). Every fifth row includes 災難復原; all rows include disaster/recovery plus a unique token. Text is exactly 1 KiB, every hundredth row 8 KiB. Repetitive synthetic content is not company prose.

SQLite tables: `metadata(snapshotId)`; `pages(pageId,spaceId,title,content,bodyKey,bodyBytes,bodySha,mediaId)`; `page_tags(pageId,tagId)`; `media(mediaId,key,bytes,sha256,mimeType)`; FTS5 `search_index(title,content)` joins pages.rowid. Raw content remains in pages; FTS content uses Han-run `Intl.Segmenter('zh-Hant',{granularity:'word'})` word segmentation, whitespace collapse, and unicode61. Node/ICU/SQLite versions are recorded. Source query predicates never query SQLite.

Only the first min(COUNT,256) page bodies plus V2's new page are published. The rest have NULL body descriptor fields and require explicit BODY_NOT_PUBLISHED. Thus this is one million searchable rows and a bounded hot remote-content working set, not a million-page full-content delivery proof. V2 moves p000001 to space1, changes p000002 Tags to t8/t9, changes p000003 title/body, changes all eight media hashes and adds p(COUNT+1).

Eight syntactically complete one-page PDF files use comment padding: 4×64 KiB, 3×2 MiB, 1×8 MiB. No rendering/extraction claim. Body payload is exact JSON.stringify({snapshotId,pageId,body}) plus newline. Verify body/media bytes and SHA against source oracle, not reader-provided headers.

## Artifacts, bounded building and measurement

Outputs: v1/v2 `search.sqlite`, `manifest.json`, `objects/`; root `oracle.json`, `build-inputs.json`, `progress.jsonl`, `build-report.json`. Manifest.db and objects descriptors are `{key,bytes,sha256,mimeType,file}`; file is relative to version dir. DB keys remain v1/search.sqlite/v2/search.sqlite. DB is not included in objects. All SHA computations on DB use streaming reads.

Builder uses `cache_size=-32768` (32 MiB SQLite cache target), `temp_store=FILE`, `mmap_size=0`, DELETE journal and explicit 10,000-row transaction batches. These are builder settings, not new reader settings. It commits completed batches but never publishes during construction: only after the final commit, FTS optimize, quick_check, DB close and hash does it write the immutable version manifest. A failed build remains an incomplete attempt; publisher must require successful build-report and input hash equality. Periodic progress records avoid keeping per-row state in memory. Full DB size, file-cache charges and optimize temporary I/O remain real costs; the cache target is not a total process/cgroup memory guarantee.

Reports separate builder elapsed time, resourceUsage/maxRSS, final DB size, published object bytes, batch count, exact settings and hashes of fixture/source files. No human-hour estimate, reader memory claim or comparison with A follows from builder metrics. Source hash is pinned in oracle and manifest. Existing outputs refuse overwrite; any code/contract correction uses a new output directory and preserves the failed/earlier attempt.
