import {mkdir, readFile} from 'node:fs/promises';
import {appendFileSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const sha = data => createHash('sha256').update(data).digest('hex');
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {reject(signal.reason);return;}
  const abort = () => {clearTimeout(timer);reject(signal.reason);};
  const timer = setTimeout(() => {signal?.removeEventListener('abort', abort);resolve();}, Math.max(0, ms));
  signal?.addEventListener('abort', abort, {once: true});
});
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;
const sorted = xs => [...xs].sort();
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const parseStats = text => Object.fromEntries(text.trim().split('\n').filter(Boolean).map(line => {
  const [key, value] = line.trim().split(/\s+/); return [key, Number(value)];
}));

export function summarize(rows, offered, durationSeconds) {
  const sent = rows.filter(r => r.sentMs !== null);
  const ok = rows.filter(r => r.check === 'ok' && r.status === 200);
  const refused = rows.filter(r => r.check === 'admission-rejection');
  const timeout = rows.filter(r => r.check === 'timeout');
  const missed = rows.filter(r => r.check === 'generator-missed');
  const stopped = rows.filter(r => r.check === 'aborted-after-fatal');
  const abortedInflight = rows.filter(r => r.check === 'aborted-inflight');
  const late = rows.filter(r => r.queueLagMs > 250);
  const stale = rows.filter(r => r.check === 'expected-stale');
  const failed = rows.filter(r => !['ok', 'admission-rejection', 'timeout', 'expected-stale', 'generator-missed', 'aborted-after-fatal', 'aborted-inflight'].includes(r.check));
  return {
    offered, sent: sent.length, completed: sent.filter(r => r.responseComplete).length,
    successful: ok.length, refused: refused.length, timeouts: timeout.length,
    expectedStale: stale.length, generatorMissed: missed.length, generatorLate: late.length, abortedAfterFatal: stopped.length,
    abortedInflight: abortedInflight.length,
    correctnessOrTransportFailures: failed.length,
    sentPerSecond: sent.length / durationSeconds, successfulPerSecond: ok.length / durationSeconds,
    bytes: rows.reduce((sum, row) => sum + (row.bytes ?? 0), 0),
    sampleCount: rows.length, successfulP95Ms: percentile(ok.map(r => r.serviceMs), .95),
    allSentP95Ms: percentile(sent.map(r => r.serviceMs), .95),
    scheduledToDoneP95Ms: percentile(rows.map(r => r.scheduledToDoneMs), .95),
    offeredFailureFraction: offered ? (refused.length + timeout.length + failed.length + missed.length + stopped.length + abortedInflight.length) / offered : null,
    statuses: Object.fromEntries([...new Set(rows.map(r => String(r.status)))].map(status =>
      [status, rows.filter(r => String(r.status) === status).length])),
  };
}

function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw Error('Expected --key value');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  if (!result.config || !result.oracle || !result.out || !['smoke', 'formal'].includes(result.mode)) {
    throw Error('Usage: load.mjs --config PATH --oracle PATH --out NEW_OUTDIR --mode smoke|formal');
  }
  return result;
}

export async function main(argv) {
  const options = args(argv);
  const config = JSON.parse(await readFile(options.config, 'utf8'));
  const oracleBytes = await readFile(options.oracle);
  const oracle = JSON.parse(oracleBytes);
  if (new URL(config.baseUrl).hostname !== '127.0.0.1') throw Error('LOOPBACK_ONLY');
  const out = path.resolve(options.out);
  await mkdir(out); // Preserve every attempt, including instrument failures.
  const rawFile = path.join(out, 'raw.ndjson'), resourceFile = path.join(out, 'resources.ndjson');
  const startedAt = new Date().toISOString(), origin = performance.now();
  let fatal = null, activeVersion = 'v1', samplingError = null, sampler;
  const stages = [], checks = [], updates = [], stageControllers = new Set();
  const executionAbort = new AbortController();
  const monotonic = () => performance.now() - origin;
  const log = row => appendFileSync(rawFile, JSON.stringify(row) + '\n');
  const fail = reason => {
    if (!fatal) {
      fatal = reason;executionAbort.abort();
      for (const controller of stageControllers) controller.abort();
    }
  };
  const prepared = {};
  for (const [version, value] of Object.entries(oracle.versions)) {
    prepared[version] = {
      ...value,
      queryMap: new Map(value.queries.map(q => [q.id, {...q, eligible: new Set(q.eligibleIds)}])),
      pageMap: new Map(value.pages.map(p => [p.pageId, p])),
      metadata: new Map((value.searchPages ?? []).map(p => [p.pageId, p])),
      mediaMap: new Map(value.media.map(m => [m.mediaId, m])),
    };
    if (!prepared[version].metadata.size) throw Error('ORACLE_SEARCH_METADATA_REQUIRED');
  }

  const groupSpecs = [['reader', config.readerCgroup, '200000 100000', 1073741824],
    ['minio', config.minioCgroup, '100000 100000', 536870912]];
  const baselineEvents = new Map();
  function sampleResources() {
    if (config.diskGuardFile && existsSync(config.diskGuardFile)) fail('DISK_GUARD');
    const groups = {};
    for (const [name, directory, expectedCpu, expectedMemory] of groupSpecs) {
      if (!directory || !path.isAbsolute(directory)) throw Error('CGROUP_PATH_REQUIRED:' + name);
      const read = file => readFileSync(path.join(directory, file), 'utf8').trim();
      const cpuMax = read('cpu.max'), memoryMax = read('memory.max'), swapMax = read('memory.swap.max');
      if (cpuMax !== expectedCpu || Number(memoryMax) !== expectedMemory || swapMax !== '0') {
        throw Error('CGROUP_LIMIT_MISMATCH:' + name + ':' + [cpuMax, memoryMax, swapMax].join(','));
      }
      const events = parseStats(read('memory.events'));
      if (!baselineEvents.has(name)) baselineEvents.set(name, events);
      const baseline = baselineEvents.get(name);
      if ((events.oom ?? 0) > (baseline.oom ?? 0) || (events.oom_kill ?? 0) > (baseline.oom_kill ?? 0)) fail('CGROUP_OOM:' + name);
      groups[name] = {cpuMax, memoryMax: Number(memoryMax), swapMax: Number(swapMax),
        current: Number(read('memory.current')), peak: Number(read('memory.peak')),
        cpu: parseStats(read('cpu.stat')), memory: parseStats(read('memory.stat')), events,
        processes: read('cgroup.procs').split('\n').filter(Boolean).map(Number),
        io: existsSync(path.join(directory, 'io.stat')) ? read('io.stat') : null};
      if (!groups[name].processes.length) fail('CGROUP_EMPTY:' + name);
    }
    const row = {at: new Date().toISOString(), ms: monotonic(), groups};
    appendFileSync(resourceFile, JSON.stringify(row) + '\n');
    return row;
  }

  function checkSearch(json, queryId) {
    const version = prepared[json.snapshotId];
    if (!version) throw Error('UNKNOWN_RESPONSE_VERSION');
    const query = version.queryMap.get(queryId);
    if (!query || json.total !== query.total || !Array.isArray(json.hits) || json.hits.length !== Math.min(10, query.total)) throw Error('SEARCH_TOTAL_OR_LENGTH');
    const ids = new Set();
    for (const hit of json.hits) {
      const source = version.metadata.get(hit.pageId);
      if (ids.has(hit.pageId) || !query.eligible.has(hit.pageId) || !source) throw Error('SEARCH_ELIGIBILITY');
      ids.add(hit.pageId);
      if (hit.spaceId !== source.spaceId || hit.title !== source.title ||
          !equal(sorted(hit.tagIds ?? []), sorted(source.tagIds ?? source.tags ?? [])) || typeof hit.snippet !== 'string' || !hit.snippet) throw Error('SEARCH_METADATA');
      if (typeof source.snippet !== 'string' || hit.snippet !== source.snippet) throw Error('SEARCH_SNIPPET_SOURCE_MISMATCH');
      if (hit.url) {
        const url = new URL(hit.url, config.baseUrl);
        if (url.searchParams.get('version') !== json.snapshotId) throw Error('SEARCH_LINK_VERSION');
      }
    }
    // Never regress the live hint when a pinned v1 request completes after activation.
    if (json.snapshotId === 'v2') activeVersion = 'v2';
  }

  function task(kind, sequence, version = activeVersion) {
    const v = prepared[version];
    if (kind === 'search') {
      const query = v.queries[sequence % v.queries.length];
      const params = new URLSearchParams({q: query.q});
      if (query.spaceId) params.set('spaceId', query.spaceId);
      query.tags.forEach(tag => params.append('tagId', tag));
      return {kind, queryId: query.id, version, identity: query.identity, url: '/search?' + params};
    }
    const page = v.pages[sequence % Math.min(v.pages.length, 256)];
    const params = new URLSearchParams({pageId: page.pageId, version});
    if (kind === 'media') params.set('mediaId', page.mediaId);
    return {kind, version, pageId: page.pageId, mediaId: kind === 'media' ? page.mediaId : null,
      identity: 'all', url: '/' + kind + '?' + params};
  }

  async function request(work, phase, scheduledMs, allowStale = false, stageSignal = null, {headers = {}, deadline = 5000} = {}) {
    const sentMs = monotonic(), sentEpochMs = Date.now();
    const row = {phase, type: work.kind, query: work.queryId ?? null, version: work.version,
      pageId: work.pageId ?? null, mediaId: work.mediaId ?? null,
      scheduledMs, sentMs, sentEpochMs, queueLagMs: sentMs - scheduledMs, status: null, bytes: 0, check: null};
    try {
      const response = await fetch(config.baseUrl + work.url, {
        headers: {'x-cap-identity': work.identity, ...headers},
        signal: AbortSignal.any([executionAbort.signal, ...(stageSignal ? [stageSignal] : []), AbortSignal.timeout(deadline)]), redirect: 'error',
      });
      row.status = response.status;
      const bytes = Buffer.from(await response.arrayBuffer());row.bytes = bytes.length;row.responseComplete = true;
      if (response.status === 503 || response.status === 429) {
        const error = JSON.parse(bytes).error;
        row.errorCode = typeof error === 'string' ? error : error?.code;
        if (!['SEARCH_BUSY', 'CONTENT_BUSY', 'QUEUE_TIMEOUT'].includes(row.errorCode)) throw Error('UNEXPECTED_UNAVAILABLE:' + row.errorCode);
        row.check = 'admission-rejection';
      } else if (response.status === 409 && allowStale && work.kind !== 'search') {
        if (JSON.parse(bytes).error?.code !== 'VERSION_MISMATCH') throw Error('UNEXPECTED_409_CONTRACT');
        row.check = 'expected-stale';
      } else if (response.status !== 200) {
        throw Error('UNEXPECTED_HTTP_' + response.status);
      } else if (work.kind === 'search') {
        const json = JSON.parse(bytes);row.responseVersion = json.snapshotId;
        checkSearch(json, work.queryId);row.check = 'ok';
      } else if (work.kind === 'page') {
        const json = JSON.parse(bytes), expected = prepared[work.version].pageMap.get(work.pageId);
        if (json.snapshotId !== work.version || json.pageId !== work.pageId || typeof json.body !== 'string') throw Error('BODY_IDENTITY');
        const canonical = Buffer.from(JSON.stringify({snapshotId: json.snapshotId, pageId: json.pageId, body: json.body}) + '\n');
        if (sha(canonical) !== expected.bodySha || canonical.length !== expected.bodyBytes) throw Error('BODY_HASH');
        row.responseVersion = json.snapshotId;row.check = 'ok';
      } else {
        const expected = prepared[work.version].mediaMap.get(work.mediaId);
        if (bytes.length !== expected.bytes || sha(bytes) !== expected.sha256) throw Error('MEDIA_HASH');
        row.check = 'ok';
      }
    } catch (error) {
      row.error = String(error.message).slice(0, 240);
      if (executionAbort.signal.aborted && fatal) row.check = 'aborted-inflight';
      else if (error.name === 'TimeoutError' || error.name === 'AbortError') row.check = 'timeout';
      else { row.check = 'failure'; fail(phase + ':' + row.error); }
    }
    row.doneMs = monotonic();row.doneEpochMs = Date.now();row.serviceMs = row.doneMs - sentMs;
    row.scheduledToDoneMs = row.doneMs - scheduledMs;log(row);return row;
  }

  async function control(url, {identity = 'all', expected = 200, method = 'GET', body, deadline = 5000, check} = {}) {
    if (fatal) return {url, identity, expected, passed: false, skippedAfterFatal: true};
    const began = monotonic();
    let result;
    try {
      const response = await fetch(config.baseUrl + url, {method,
        headers: {'x-cap-identity': identity, ...(method === 'POST' ? {'x-cap-admin': config.adminToken, 'content-type': 'application/json'} : {})},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.any([executionAbort.signal, AbortSignal.timeout(deadline)]), redirect: 'error'});
      const bytes = Buffer.from(await response.arrayBuffer());
      let json;try { json = JSON.parse(bytes); } catch {}
      if (response.status !== expected) throw Error('CONTROL_STATUS:' + response.status + ':expected:' + expected);
      if (check) check(json, bytes);
      result = {url, identity, expected, status: response.status, bytes: bytes.length, passed: true, json};
    } catch (error) { result = {url, identity, expected, passed: false, error: String(error.message)}; fail(result.error); }
    result.elapsedMs = monotonic() - began;checks.push(result);return result;
  }

  async function stage(name, kind, rate, seconds, {allowStale = false, update = false} = {}) {
    const rows = [], pending = new Set(), counters = {search: 0, page: 0, media: 0};
    const stageController = new AbortController();
    stageControllers.add(stageController);
    const began = monotonic(), offered = Math.floor(rate * seconds);
    let updatePromise = null, updateTimer;
    if (update) updateTimer = setTimeout(() => {
      const receipt = {startedEpochMs: Date.now(), startedMs: monotonic()};updates.push(receipt);
      updatePromise = control('/update', {method: 'POST', body: {version: 'v2'}, deadline: 55000})
        .then(result => {receipt.endedEpochMs = Date.now();receipt.endedMs = monotonic();receipt.result = result;
          if (result.passed && result.json?.snapshotId === 'v2') activeVersion = 'v2';
          else if (result.passed) fail('UPDATE_RESPONSE_VERSION');
        });
    }, 5000);
    let scheduled = 0;
    for (let i = 0; i < offered && !fatal; i++) {
      const due = began + i * 1000 / rate;
      try {await sleep(due - monotonic(), executionAbort.signal);} catch {break;}
      if (fatal) break;
      scheduled++;
      let type = kind;
      if (kind === 'content') type = i % 2 === 0 ? 'page' : 'media';
      if (kind === 'mixed') type = i % 10 < 6 ? 'search' : (i % 10 < 9 ? 'page' : 'media');
      const work = task(type, counters[type]++);
      if (pending.size >= 64) {
        const doneMs = monotonic();
        const missed = {phase: name, type, query: work.queryId ?? null, version: work.version,
          scheduledMs: due, sentMs: null, doneMs, queueLagMs: doneMs - due, status: null, bytes: 0,
          check: 'generator-missed', scheduledToDoneMs: doneMs - due};
        log(missed);rows.push(missed);continue;
      }
      const promise = request(work, name, due, allowStale, stageController.signal).then(row => rows.push(row));
      pending.add(promise);promise.finally(() => pending.delete(promise));
    }
    if (!fatal) {try {await sleep(began + seconds * 1000 - monotonic(), executionAbort.signal);} catch {}}
    if (updateTimer) clearTimeout(updateTimer);
    let drainTimer;
    const drained = await Promise.race([
      Promise.all(pending).then(() => true),
      new Promise(resolve => {drainTimer = setTimeout(() => resolve(false), 6000);}),
    ]);
    clearTimeout(drainTimer);
    if (!drained) {fail('DRAIN_TIMEOUT');stageController.abort();}
    // Aborted fetches must settle before the final counters are frozen.
    // This also retains their terminal records rather than producing late rows.
    await Promise.allSettled([...pending]);
    for (let i = scheduled; i < offered; i++) {
      const due = began + i * 1000 / rate, doneMs = monotonic();
      const row = {phase: name, type: kind, query: null, version: activeVersion,
        scheduledMs: due, sentMs: null, doneMs, queueLagMs: 0, status: null, bytes: 0,
        check: 'aborted-after-fatal', error: fatal, scheduledToDoneMs: Math.max(0, doneMs - due)};
      log(row);rows.push(row);
    }
    if (updatePromise) await updatePromise;
    const health = await control('/status', {check: json => {
      if (json.fatal) throw Error('WORKER_FATAL:' + JSON.stringify(json.fatal));
      const pids = readFileSync(path.join(config.readerCgroup, 'cgroup.procs'), 'utf8').trim().split('\n').map(Number);
      if (![json.pid, ...json.workers].every(pid => pids.includes(pid))) throw Error('PROCESS_ESCAPED_READER_CGROUP');
    }});
    if (update && !fatal) {
      const receipt = updates.at(-1)?.result?.json;
      const overlap = receipt && rows.filter(row => row.sentEpochMs !== undefined &&
        row.sentEpochMs < receipt.downloadEndedMs && row.doneEpochMs > receipt.downloadStartedMs);
      const activatedWithinWindow = receipt && receipt.activatedMs <= updates.at(-1).startedEpochMs + 55000;
      const responseVersions = new Set(rows.filter(row => row.check === 'ok' && row.type === 'search').map(row => row.responseVersion));
      updates.at(-1).overlappingRequests = overlap?.length ?? 0;
      updates.at(-1).observedSearchVersions = [...responseVersions];
      updates.at(-1).activationSpanningRequests = receipt ? rows.filter(row => row.sentEpochMs < receipt.activatedMs && row.doneEpochMs > receipt.activatedMs).length : 0;
      if (!receipt || !Number.isFinite(receipt.downloadStartedMs) || !Number.isFinite(receipt.downloadEndedMs) ||
          receipt.downloadEndedMs < receipt.downloadStartedMs || receipt.snapshotId !== 'v2' ||
          !activatedWithinWindow || !overlap.length || !responseVersions.has('v1') || !responseVersions.has('v2') ||
          health.json?.snapshotId !== 'v2') fail('UPDATE_EVIDENCE_INCOMPLETE');
    }
    if (rows.length !== offered) fail('INCOMPLETE_ARRIVAL_TERMINALS');
    const summary = summarize(rows, offered, seconds);
    const completedDuration = monotonic() - began;
    const generatorValid = !summary.generatorMissed && !summary.generatorLate && scheduled === offered;
    const qualifies = generatorValid && !fatal && summary.offeredFailureFraction <= .01 &&
      summary.scheduledToDoneP95Ms !== null && summary.scheduledToDoneP95Ms <= 2000;
    const result = {name, kind, rate, seconds, scheduled, startedMs: began, endedMs: monotonic(),
      elapsedIncludingDrainMs: completedDuration, generatorValid, qualifies, fatal, ...summary,
      elapsedSentPerSecond: summary.sent / (completedDuration / 1000),
      elapsedSuccessfulPerSecond: summary.successful / (completedDuration / 1000),
      byType: Object.fromEntries(['search', 'page', 'media'].map(type => {
        const subset = rows.filter(r => r.type === type);return [type, summarize(subset, subset.length, seconds)];
      }))};
    stages.push(result);writeFileSync(path.join(out, 'progress.json'), JSON.stringify({fatal, stages, updates}, null, 2));
    stageControllers.delete(stageController);
    return result;
  }

  let firstSample, lastSample;
  const totalDeadline = setTimeout(() => fail('TOTAL_WORKLOAD_DEADLINE_15_MINUTES'), 15 * 60 * 1000);
  try {
    firstSample = sampleResources();
    sampler = setInterval(() => {try {lastSample = sampleResources();} catch (error) {samplingError = error.message;fail('RESOURCE_SAMPLER:' + error.message);}}, 500);
    await control('/status', {check: json => {if (json.snapshotId !== 'v1' || json.fatal) throw Error('START_REQUIRES_HEALTHY_V1');}});
    await control('/search?q=disaster', {identity: 'unknown', expected: 503,
      check: json => {if (json.error?.code !== 'AUTHORIZATION_UNKNOWN') throw Error('UNKNOWN_AUTH_CONTRACT');}});
    await control('/search?q=disaster', {identity: 'none', check: json => {if (json.total !== 0 || json.hits.length) throw Error('NONE_SEARCH_LEAK');}});
    await control('/page?pageId=p000001&version=v1', {identity: 'none', expected: 404});
    await control('/media?pageId=p000001&mediaId=m0&version=v1', {identity: 'none', expected: 404});
    await control('/media?pageId=p000001&mediaId=m1&version=v1', {expected: 404});
    await control('/page?pageId=p000001&version=v0', {expected: 409});
    if (oracle.sourceCount > 256) await control('/page?pageId=p000257&version=v1', {expected: 503,
      check: json => {if (json.error?.code !== 'BODY_NOT_PUBLISHED') throw Error('SUBSET_CONTRACT');}});
    if (options.mode === 'smoke' && !fatal) {
      await control('/update', {method: 'POST', body: {version: 'v2', badHash: true}, expected: 503, deadline: 55000,
        check: json => {if (json.error?.code !== 'ARTIFACT_HASH') throw Error('BAD_HASH_REJECTION_REASON');}});
      await control('/status', {check: json => {if (json.snapshotId !== 'v1' || json.fatal) throw Error('FAILED_UPDATE_DID_NOT_KEEP_V1');}});
    }
    if (!fatal) {
      // Read every query shape and each attachment size before a rate phase.
      for (let i = 0; i < prepared.v1.queries.length && !fatal; i++) {
        const r = await request(task('search', i), 'contract', monotonic());if (r.check !== 'ok') fail('CONTRACT_SEARCH:' + r.check);
      }
      for (let i = 0; i < 8 && !fatal; i++) {
        const page = await request(task('page', i), 'contract', monotonic());
        const media = await request(task('media', i), 'contract', monotonic());
        if (page.check !== 'ok' || media.check !== 'ok') fail('CONTRACT_CONTENT');
      }
    }
    if (!fatal && options.mode === 'smoke') {
      await stage('smoke-mixed', 'mixed', 2, 5);
      if (!fatal) {
        if (config.testHooks !== true) fail('SMOKE_HOLD_HOOK_REQUIRED');
        else {
          // Deliberate smoke-only hold verifies old-version pin/drain behavior.
          // It is never part of measured capacity latency or the formal config.
          const beganEpoch = Date.now(), beganMs = monotonic();
          const held = request(task('page', 0, 'v1'), 'smoke-held-v1', beganMs, false, null,
            {headers: {'x-cap-hold-until-activation': '1', 'x-cap-admin': config.adminToken}, deadline: 45000});
          let observedPin = false;
          while (!fatal && monotonic() - beganMs < 2000 && !observedPin) {
            const status = await control('/status');
            observedPin = status.json?.events?.some(event => event.type === 'held-pin' && event.at >= beganEpoch) ?? false;
            if (!observedPin && !fatal) {try {await sleep(50, executionAbort.signal);} catch {}}
          }
          if (!observedPin) fail('SMOKE_HELD_PIN_NOT_OBSERVED');
          const activation = !fatal ? await control('/update', {method: 'POST', body: {version: 'v2'}, deadline: 40000}) : null;
          if (activation?.passed && activation.json?.snapshotId === 'v2') activeVersion = 'v2';
          const heldResult = await held;
          const passed = !fatal && activation?.passed && heldResult.check === 'ok' && heldResult.responseVersion === 'v1' &&
            heldResult.sentEpochMs < activation.json.activatedMs && heldResult.doneEpochMs >= activation.json.activatedMs;
          checks.push({kind: 'smoke-held-version-pin', passed, observedPin,
            activation: activation?.json ?? null, heldResult,
            scope: 'admin-gated deliberate hold; excluded from formal capacity'});
          if (!passed) fail('SMOKE_HELD_VERSION_PIN_FAILED');
          if (!fatal) {
            await control('/status', {check: json => {if (json.snapshotId !== 'v2' || json.fatal) throw Error('SMOKE_V2_NOT_HEALTHY');}});
            await control('/page?pageId=p000001&version=v1', {expected: 409,
              check: json => {if (json.error?.code !== 'VERSION_MISMATCH') throw Error('OLD_URL_CONTRACT');}});
            await control('/page?pageId=p000001&version=v2', {identity: 'a', expected: 404});
            for (let i = 0; i < prepared.v2.queries.length && !fatal; i++) {
              const row = await request(task('search', i, 'v2'), 'smoke-post-update', monotonic());
              if (row.check !== 'ok') fail('SMOKE_POST_UPDATE_SEARCH');
            }
            for (let i = 0; i < 8 && !fatal; i++) {
              const page = await request(task('page', i, 'v2'), 'smoke-post-update', monotonic());
              const media = await request(task('media', i, 'v2'), 'smoke-post-update', monotonic());
              if (page.check !== 'ok' || media.check !== 'ok') fail('SMOKE_POST_UPDATE_CONTENT');
            }
          }
        }
      }
    }
    if (!fatal && options.mode === 'formal') {
      if (config.testHooks !== false) fail('FORMAL_TEST_HOOK_MUST_BE_DISABLED');
    }
    if (!fatal && options.mode === 'formal') {
      await stage('warmup-excluded', 'mixed', 2, 10);
      const plans = [['search', [1, 4, 8, 16, 32]], ['content', [2, 8, 16, 32]], ['mixed', [2, 8, 16, 32]]];
      let mixedRate = null;
      for (const [kind, rates] of plans) {
        for (const rate of rates) {
          if (fatal) break;
          const result = await stage(kind + '-' + rate, kind, rate, 20);
          if (kind === 'mixed' && result.qualifies) mixedRate = rate;
          if (!result.qualifies) break;
        }
      }
      if (!fatal && mixedRate !== null) {
        await stage('update-mixed', 'mixed', Math.max(2, Math.min(8, mixedRate)), 60, {allowStale: true, update: true});
        if (!fatal) {
          await control('/status', {check: json => {if (json.snapshotId !== 'v2') throw Error('UPDATE_NOT_ACTIVE');}});
          await control('/page?pageId=p000001&version=v1', {expected: 409});
          await control('/page?pageId=p000001&version=v2', {identity: 'a', expected: 404});
          for (let i = 0; i < prepared.v2.queries.length && !fatal; i++) {
            const r = await request(task('search', i, 'v2'), 'post-update-contract', monotonic());if (r.check !== 'ok') fail('POST_UPDATE_SEARCH');
          }
          for (let i = 0; i < 8 && !fatal; i++) {
            const page = await request(task('page', i, 'v2'), 'post-update-contract', monotonic());
            const media = await request(task('media', i, 'v2'), 'post-update-contract', monotonic());
            if (page.check !== 'ok' || media.check !== 'ok') fail('POST_UPDATE_CONTENT');
          }
        }
      }
    }
  } catch (error) {fail('HARNESS:' + error.message);}
  finally {
    clearInterval(sampler);
    clearTimeout(totalDeadline);
    try {lastSample = sampleResources();} catch (error) {samplingError = error.message;fail('RESOURCE_FINAL:' + error.message);}
    const result = {schemaVersion: 1, startedAt, endedAt: new Date().toISOString(), elapsedMs: monotonic(),
      mode: options.mode, oracleSha256: sha(oracleBytes), seed: oracle.seed, sourceCount: oracle.sourceCount,
      bodyCoverage: '256-page hot working set; not full corpus content availability or cold-object capacity',
      rankingScope: oracle.rankingContract, resourceLimits: groupSpecs.map(([name, , cpu, memory]) => ({name, cpu, memory, swap: 0})),
      workload: {searchRates: [1, 4, 8, 16, 32], contentRates: [2, 8, 16, 32], mixedRates: [2, 8, 16, 32], stageSeconds: 20,
        mixedRatio: '6 search : 3 page : 1 media', maxInflight: 64, deadlineMs: 5000,
        generatorLagLimitMs: 250, researchP95LimitMs: 2000, researchFailureFraction: .01,
        note: 'Short bounded observations, not a production SLO or A/B comparison'},
      fatal, samplingError, correctnessPassed: !fatal, checks, stages, updates, firstSample, lastSample};
    writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({out, mode: options.mode, fatal, stages: stages.length, elapsedMs: result.elapsedMs}));
    if (fatal) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
