import {fork} from 'node:child_process';
import {mkdir, readFile, stat} from 'node:fs/promises';
import {appendFileSync, writeFileSync, openSync, closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {source, eligible, snippet, parsePageId, querySpecs} from '../c-million-20261116/source.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i]?.startsWith('--') || process.argv[i + 1] === undefined) throw Error('Expected --key value');
  options[process.argv[i].slice(2)] = process.argv[i + 1];
}
if (!options.db || !options.oracle || !options['original-worker'] || !options.out) throw Error('Usage: run.mjs --db PATH --oracle PATH --original-worker PATH --out NEW_DIRECTORY');
const dbPath = path.resolve(options.db), originalPath = path.resolve(options['original-worker']), out = path.resolve(options.out);
const profilePath = fileURLToPath(new URL('./worker.mjs', import.meta.url));
const sourcePath = fileURLToPath(new URL('../c-million-20261116/source.mjs', import.meta.url));
await mkdir(out);
const rawFile = path.join(out, 'raw.ndjson'), beganAt = new Date().toISOString(), origin = performance.now();
const now = () => performance.now() - origin, record = data => appendFileSync(rawFile, JSON.stringify({at: new Date().toISOString(), ms: now(), ...data}) + '\n');
const oracleBytes = await readFile(options.oracle), oracle = JSON.parse(oracleBytes);
const inputFiles = {originalWorker: originalPath, profileWorker: profilePath, runner: fileURLToPath(import.meta.url), source: sourcePath, oracle: path.resolve(options.oracle)};
const inputHashes = Object.fromEntries(await Promise.all(Object.entries(inputFiles).map(async ([name, filename]) => [name, sha(await readFile(filename))])));
const initialDbStat = await stat(dbPath), generatorStart = process.resourceUsage();
const references = [], measurements = [], plans = [], workers = [];
let failure = null, snapshotId = null, sequence = 0;
function fail(category, reason) {
  if (!failure) {failure = {category, reason, at: new Date().toISOString(), ms: now()};record({event: 'stop', ...failure});}
  for (const worker of workers) if (!worker.exited) worker.kill('stop');
}

class Child {
  constructor(filename, label) {
    this.label = label;this.closing = false;this.exited = false;this.pending = null;this.exitInfo = null;
    this.stdout = openSync(path.join(out, label + '.stdout.log'), 'wx');this.stderr = openSync(path.join(out, label + '.stderr.log'), 'wx');
    this.child = fork(filename, [dbPath], {stdio: ['ignore', this.stdout, this.stderr, 'ipc']});
    this.pid = this.child.pid;this.file = filename;workers.push(this);
    record({event: 'spawn', label, pid: this.pid, file: filename});
    this.exitPromise = new Promise(resolve => {this.resolveExit = resolve;});
    this.ready = new Promise((resolve, reject) => {this.resolveReady = resolve;this.rejectReady = reject;});
    this.startTimer = setTimeout(() => {this.rejectReady(Error('WORKER_READY_TIMEOUT'));fail('capacity', label + ':WORKER_READY_TIMEOUT');}, 10000);
    this.child.on('message', message => {
      if (message.ready) {
        clearTimeout(this.startTimer);this.readyInfo = message;record({event: 'ready', label, pid: this.pid, message});this.resolveReady(message);return;
      }
      const pending = this.pending;
      if (!pending || message.id !== pending.id) {fail('instrument', label + ':UNEXPECTED_IPC_MESSAGE');return;}
      clearTimeout(pending.timer);this.pending = null;
      const elapsedMs = now() - pending.startMs;record({event: 'reply', label, pid: this.pid, phase: pending.phase,
        queryId: pending.queryId, round: pending.round, parentRoundTripMs: elapsedMs, message});
      if (message.error) pending.reject(Error('WORKER_QUERY_ERROR:' + message.error));
      else pending.resolve({message, parentRoundTripMs: elapsedMs});
    });
    this.child.once('error', error => {
      this.rejectReady(error);if (this.pending) {clearTimeout(this.pending.timer);this.pending.reject(error);this.pending = null;}
      fail('service-unclassified', label + ':CHILD_ERROR:' + error.message);
    });
    this.child.once('exit', (code, signal) => {
      clearTimeout(this.startTimer);this.exited = true;this.exitInfo = {code, signal, ms: now()};
      closeSync(this.stdout);closeSync(this.stderr);record({event: 'exit', label, pid: this.pid, expected: this.closing, ...this.exitInfo});
      this.rejectReady(Error('WORKER_EXIT_BEFORE_READY'));
      if (this.pending) {clearTimeout(this.pending.timer);this.pending.reject(Error('WORKER_EXIT'));this.pending = null;}
      this.resolveExit(this.exitInfo);
      if (!this.closing && !failure) fail('capacity', label + ':UNEXPECTED_WORKER_EXIT');
    });
  }
  kill(reason) {
    this.closing = true;
    if (!this.exited) {record({event: 'kill', label: this.label, pid: this.pid, signal: 'SIGKILL', reason});this.child.kill('SIGKILL');}
  }
  async request(op, input, context) {
    if (failure || this.exited || this.pending) throw Error('WORKER_NOT_READY_FOR_REQUEST');
    const id = ++sequence, startMs = now();
    record({event: 'request', label: this.label, pid: this.pid, id, op, input, ...context, deadlineMs: 4000});
    return new Promise((resolve, reject) => {
      this.pending = {id, startMs, ...context, resolve, reject, timer: setTimeout(() => {
        record({event: 'request-timeout', label: this.label, pid: this.pid, id, ...context, elapsedMs: now() - startMs});
        this.pending = null;reject(Error('PARENT_REQUEST_DEADLINE_4000MS'));fail('capacity', this.label + ':' + context.queryId + ':PARENT_REQUEST_DEADLINE_4000MS');
      }, 4000)};
      this.child.send({id, op, input}, error => {if (error && this.pending?.id === id) {
        clearTimeout(this.pending.timer);this.pending = null;reject(error);fail('service-unclassified', 'IPC_SEND:' + error.message);
      }});
    });
  }
  async close() {
    if (this.exited) return this.exitInfo;
    this.closing = true;record({event: 'close', label: this.label, pid: this.pid, signal: 'SIGTERM'});this.child.kill('SIGTERM');
    const force = setTimeout(() => this.kill('close-timeout-2000ms'), 2000);
    try {return await this.exitPromise;} finally {clearTimeout(force);}
  }
}

function inputOf(query) {
  return {q: query.q, spaceId: query.spaceId ?? null, tags: query.tags, identity: query.identity, lane: 'k4-diagnostic'};
}
function verify(result, query) {
  if (result.total !== query.total || !Array.isArray(result.hits) || result.hits.length !== Math.min(10, query.total)) throw Error('SOURCE_TOTAL_OR_LENGTH:' + query.id);
  const seen = new Set();
  for (const hit of result.hits) {
    const expected = source(parsePageId(hit.pageId, oracle.sourceCount, snapshotId), snapshotId, oracle.sourceCount);
    if (seen.has(hit.pageId) || !eligible(query.id, expected)) throw Error('SOURCE_ELIGIBILITY:' + query.id);seen.add(hit.pageId);
    if (hit.spaceId !== expected.spaceId || hit.title !== expected.title || hit.snippet !== snippet(expected.content) ||
        !same(hit.tagIds, [...expected.tags].sort())) throw Error('SOURCE_METADATA_OR_TAGS:' + query.id);
  }
}
const watchdog = setTimeout(() => fail('instrument', 'INTERNAL_TOTAL_DEADLINE_170_SECONDS'), 170000);
let queries = [], beforeProfile = null, profileReady = null;
try {
  record({event: 'inputs', inputHashes, db: {path: dbPath, bytes: initialDbStat.size, mtimeMs: initialDbStat.mtimeMs}, node: process.version});
  if (process.version !== 'v22.18.0') throw Error('NODE_VERSION_MISMATCH');
  const original = new Child(originalPath, 'reference-original');const ready = await original.ready;
  snapshotId = ready.snapshotId;queries = oracle.versions[snapshotId]?.queries;
  if (!queries || queries.length !== 9) throw Error('ORACLE_SNAPSHOT_OR_QUERY_COUNT');
  const requestSpecs = queries.map(({total, ...query}) => query);
  if (!same(requestSpecs, querySpecs(oracle.sourceCount))) throw Error('SOURCE_QUERY_SPEC_MISMATCH');
  for (const query of queries) {
    const reply = await original.request('search', inputOf(query), {phase: 'reference-warmup', queryId: query.id, round: null});
    verify(reply.message.result, query);references.push({queryId: query.id, ...reply, sourceVerified: true});
  }
  const closed = await original.close();if (!original.exited) throw Error('REFERENCE_EXIT_NOT_CONFIRMED');
  beforeProfile = {referencePid: original.pid, referenceExit: closed, confirmedAtMs: now()};record({event: 'reference-closed-before-profile', ...beforeProfile});
  if (failure) throw Error('STOPPED_BEFORE_PROFILE');
  const profiled = new Child(profilePath, 'profile');profileReady = await profiled.ready;
  if (profileReady.snapshotId !== snapshotId) throw Error('PROFILE_SNAPSHOT_MISMATCH');
  if (profileReady.nodeVersion !== 'v22.18.0' || profileReady.sqliteVersion !== '3.50.2' ||
      profileReady.pragmas?.queryOnly !== 1 || profileReady.pragmas?.cacheSize !== -8192 || profileReady.pragmas?.mmapSize !== 0) {
    throw Error('PROFILE_RUNTIME_OR_PRAGMA_MISMATCH');
  }
  for (let round = 0; round < 5; round++) {
    const order = queries.slice(round).concat(queries.slice(0, round));
    for (const query of order) {
      const reply = await profiled.request('search', inputOf(query), {phase: 'profile-measurement', queryId: query.id, round: round + 1});
      verify(reply.message.result, query);
      const reference = references.find(item => item.queryId === query.id).message.result;
      if (!same(reply.message.result, reference)) throw Error('ORDERED_REFERENCE_RESULT_MISMATCH:' + query.id);
      const timings = reply.message.timings;
      if (!timings || [timings.count.prepareMs, timings.count.executeMs, timings.top10.prepareMs, timings.top10.executeMs,
        timings.tags.prepareMs, timings.tags.executeMs].some(value => !Number.isFinite(value) || value < 0) ||
          timings.tags.prepareMs !== 0 || timings.tags.lookupCount !== reply.message.result.hits.length || !timings.tags.statementReusedFromStartup) throw Error('INVALID_TIMINGS');
      measurements.push({round: round + 1, queryId: query.id, ...reply, sourceVerified: true, exactOrderedReferenceMatch: true});
    }
  }
  // Explain after measurement: no plan-generation work is hidden in timed components.
  for (const query of queries) {
    const reference = references.find(item => item.queryId === query.id).message.result;
    const reply = await profiled.request('explain', {...inputOf(query), representativePageId: reference.hits[0]?.pageId ?? 'p000001'},
      {phase: 'explain-after-measurement', queryId: query.id, round: null});
    plans.push({queryId: query.id, ...reply});
  }
  await profiled.close();
} catch (error) {
  if (!failure) fail(error.message.startsWith('WORKER_QUERY_ERROR:') ? 'query-failure' :
    /SOURCE_|REFERENCE_RESULT|SNAPSHOT/.test(error.message) ? 'quality' : 'instrument', error.message);
} finally {
  clearTimeout(watchdog);
  await Promise.all(workers.map(worker => worker.close()));
  const finalDbStat = await stat(dbPath);
  const finalHashes = Object.fromEntries(await Promise.all(Object.entries(inputFiles).map(async ([name, filename]) => [name, sha(await readFile(filename))])));
  if (!same(inputHashes, finalHashes)) fail('integrity', 'INPUT_FILE_CHANGED');
  if (initialDbStat.size !== finalDbStat.size || initialDbStat.mtimeMs !== finalDbStat.mtimeMs) fail('integrity', 'DB_STAT_CHANGED');
  const result = {schemaVersion: 4, candidate: 'C-only K4 unchanged-query component diagnosis', beganAt, endedAt: new Date().toISOString(), elapsedMs: now(),
    nodeVersion: process.version, snapshotId, sourceCount: oracle.sourceCount, oracleSha256: sha(oracleBytes),
    inputFiles, inputHashes, finalHashes, database: {path: dbPath, bytes: initialDbStat.size, beforeMtimeMs: initialDbStat.mtimeMs,
      afterMtimeMs: finalDbStat.mtimeMs, note: 'Read-only connections; DB content SHA/freeze is owned by the external helper, which may warm host cache'},
    failure, completed: !failure && references.length === 9 && measurements.length === 45 && plans.length === 9,
    referenceCount: references.length, measurementCount: measurements.length, explainCount: plans.length,
    beforeProfile, profileReady, reference: references, measurements,
    workers: workers.map(worker => ({label: worker.label, pid: worker.pid, ready: worker.readyInfo, exit: worker.exitInfo})),
    generator: {start: generatorStart, end: process.resourceUsage()},
    timingContract: {queryParentDeadlineMs: 4000, internalTotalDeadlineMs: 170000, externalTotalDeadlineMs: 180000,
      count: 'prepare + exact count execution, including MATCH/join/Space/Tags predicates',
      top10: 'prepare + ranked Top10 execution, including MATCH/join/Space/Tags predicates, sort and snippet projection',
      tags: 'Reusable statement prepared once at startup; per-query execution includes lookup/map/attachment to up to ten hits',
      workerMs: 'Normalization, predicates, component calls and instrumentation; excludes IPC/HTTP',
      unallocatedTime: 'workerMs minus timed components includes normalization, SQL construction and instrumentation overhead; normalization is not independently measured',
      parentRoundTripMs: 'IPC and scheduling plus worker, not HTTP latency',
      filterCost: 'Not independently measured; filters participate in both count and Top10 plans',
      cache: 'Reference and profile are separate SQLite connections. Host cache may be warm; profile connection cache is not claimed warm',
      reference: 'Compatibility anchor and explicit warmup, not a timed optimization baseline',
      quality: 'Independent source oracle plus exact ordered equality to original worker, not user relevance or ES equivalence'},
    limitations: ['Sequential isolated diagnostic; no Next, MinIO, HTTP, concurrency or capacity claim',
      'Two new instrumentation files only; no SQL/index/normalization/semantic optimization',
      'Five rotated rounds are descriptive samples; EXPLAIN plans do not assign independent filter or operator runtime cost',
      'No A/B comparison; parent helper must record actual cgroup limits, membership and external timeout']};
  writeFileSync(path.join(out, 'plan.json'), JSON.stringify({generatedAfterMeasurements: true, plans, complete: plans.length === 9}, null, 2), {flag: 'wx'});
  writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2), {flag: 'wx'});
  record({event: 'finished', completed: result.completed, failure, elapsedMs: result.elapsedMs});
  console.log(JSON.stringify({out, completed: result.completed, failure, reference: references.length, measurements: measurements.length, plans: plans.length}));
  if (!result.completed) process.exitCode = 1;
}
