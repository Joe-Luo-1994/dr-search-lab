// K3: reuse the frozen K2 source specification and lane arithmetic, never its results.
import {source, eligible, snippet, parsePageId} from '../c-million-20261116/source.mjs';
import {summarize} from '../c-million-20261116/load.mjs';
import {mkdir, readFile} from 'node:fs/promises';
import {appendFileSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) {reject(signal.reason);return;}
  const cancelled = () => {clearTimeout(timer);reject(signal.reason);};
  const timer = setTimeout(() => {signal.removeEventListener('abort', cancelled);resolve();}, Math.max(0, ms));
  signal.addEventListener('abort', cancelled, {once: true});
});
const stats = text => Object.fromEntries(text.trim().split('\n').filter(Boolean).map(line => {
  const [key, value] = line.split(/\s+/);return [key, Number(value)];
}));
const htmlText = text => text.replace(/<!--[^]*?-->/g, '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) =>
  String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
  .replace(/&(quot|apos|lt|gt|amp);/g, (_, name) => ({quot: '"', apos: "'", lt: '<', gt: '>', amp: '&'}[name]));

export async function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || argv[i + 1] === undefined) throw Error('Expected --key value');
    args[argv[i].slice(2)] = argv[i + 1];
  }
  if (!args.config || !args.oracle || !args.out || !['smoke', 'formal'].includes(args.mode)) throw Error('Usage: load.mjs --config PATH --oracle PATH --out NEW_DIRECTORY --mode smoke|formal');
  const config = JSON.parse(await readFile(args.config, 'utf8')), oracleBytes = await readFile(args.oracle), oracle = JSON.parse(oracleBytes);
  const webBase = config.webBase ?? new URL(config.baseUrl).origin;
  if ([webBase, config.baseUrl].some(url => new URL(url).hostname !== '127.0.0.1')) throw Error('LOOPBACK_ONLY');
  const out = path.resolve(args.out);await mkdir(out);
  const rawFile = path.join(out, 'raw.ndjson'), resourceFile = path.join(out, 'resources.ndjson'), statusFile = path.join(out, 'status.ndjson');
  const startedAt = new Date().toISOString(), origin = performance.now(), generatorStart = process.resourceUsage();
  const now = () => performance.now() - origin, abort = new AbortController();
  const log = value => appendFileSync(rawFile, JSON.stringify(value) + '\n');
  const stages = [], checks = [], eventsBaseline = new Map();
  let stop = null, readingBaselineP95 = null, highestQualifiedSearchRate = null, sampleCount = 0;
  let resourceTimer, statusTimer, statusBusy = false, statusPending = Promise.resolve();
  const stopRun = (category, reason) => {if (!stop) {stop = {category, reason, ms: now(), at: new Date().toISOString()};abort.abort();}};
  const queries = oracle.versions.v1.queries, queriesById = new Map(queries.map(query => [query.id, query]));
  if (queries.length !== 9 || !queriesById.has('common') || !queriesById.has('restricted-tags')) throw Error('EXPECTED_K2_NINE_QUERY_CONTRACT');
  const expectedPage = source(parsePageId('p000001', oracle.sourceCount, 'v1'), 'v1', oracle.sourceCount);
  const readerCpu = config.readerCpu ?? 200, readerMemory = config.readerMemory ?? 4294967296;
  if (!Number.isInteger(readerCpu) || readerCpu < 1 || !Number.isSafeInteger(readerMemory) || readerMemory < 1) throw Error('INVALID_FROZEN_READER_BUDGET');
  const groups = [['reader', config.readerCgroup, `${readerCpu * 1000} 100000`, readerMemory],
    ['minio', config.minioCgroup, '400000 100000', 4294967296]];

  function resources(all = false) {
    if (config.diskGuardFile && existsSync(config.diskGuardFile)) stopRun('capacity', 'DISK_GUARD');
    const result = {at: new Date().toISOString(), ms: now(), groups: {}};
    for (const [name, directory, expectedCpu, expectedMemory] of groups) {
      if (name === 'minio' && !all && sampleCount % 4 !== 0) continue;
      if (!directory || !path.isAbsolute(directory)) throw Error('CGROUP_PATH_REQUIRED:' + name);
      const read = file => readFileSync(path.join(directory, file), 'utf8').trim();
      const cpuMax = read('cpu.max'), memoryMax = Number(read('memory.max')), swapMax = Number(read('memory.swap.max'));
      if (cpuMax !== expectedCpu || memoryMax !== expectedMemory || swapMax !== 0) throw Error('CGROUP_LIMIT_MISMATCH:' + name);
      const events = stats(read('memory.events'));
      if (!eventsBaseline.has(name)) eventsBaseline.set(name, events);
      const baseline = eventsBaseline.get(name);
      if ((events.oom ?? 0) > (baseline.oom ?? 0) || (events.oom_kill ?? 0) > (baseline.oom_kill ?? 0)) stopRun('capacity', 'CGROUP_OOM:' + name);
      result.groups[name] = {cpuMax, memoryMax, swapMax, current: Number(read('memory.current')), peak: Number(read('memory.peak')),
        cpu: stats(read('cpu.stat')), memory: stats(read('memory.stat')), events,
        processes: read('cgroup.procs').split('\n').filter(Boolean).map(Number),
        io: existsSync(path.join(directory, 'io.stat')) ? read('io.stat') : null};
      if (!result.groups[name].processes.length) stopRun('capacity', 'CGROUP_EMPTY:' + name);
    }
    sampleCount++;appendFileSync(resourceFile, JSON.stringify(result) + '\n');return result;
  }

  function verifyHtml(html) {
    const tag = html.match(/<main\b([^>]*)>/i)?.[1];
    const attr = name => tag?.match(new RegExp('\\b' + name + '=["\']([^"\']*)["\']', 'i'))?.[1];
    if (attr('data-pageid') !== 'p000001' || attr('data-version') !== 'v1') throw Error('SSR_IDENTITY');
    const title = html.match(/<h1\b[^>]*>([^]*?)<\/h1>/i)?.[1], body = html.match(/<pre\b[^>]*>([^]*?)<\/pre>/i)?.[1];
    if (title === undefined || body === undefined || htmlText(title) !== expectedPage.title || htmlText(body) !== expectedPage.content) throw Error('SSR_SOURCE_CONTENT');
  }
  function verifySearch(json, queryId) {
    const query = queriesById.get(queryId);
    if (json?.snapshotId !== 'v1' || !query || json.total !== query.total || !Array.isArray(json.hits) || json.hits.length !== Math.min(10, query.total)) throw Error('SEARCH_TOTAL_LENGTH_OR_VERSION');
    const seen = new Set();
    for (const hit of json.hits) {
      const expected = source(parsePageId(hit.pageId, oracle.sourceCount, 'v1'), 'v1', oracle.sourceCount);
      if (seen.has(hit.pageId) || !eligible(queryId, expected)) throw Error('SEARCH_ELIGIBILITY');
      seen.add(hit.pageId);
      if (hit.spaceId !== expected.spaceId || hit.title !== expected.title || hit.snippet !== snippet(expected.content) ||
          !same([...(hit.tagIds ?? [])].sort(), [...expected.tags].sort())) throw Error('SEARCH_METADATA_OR_SNIPPET');
      if (!hit.url) throw Error('SEARCH_LINK_MISSING');
      const link = new URL(hit.url, config.baseUrl), api = new URL(config.baseUrl);
      if (link.origin !== api.origin || link.username || link.password || link.hash || link.pathname !== api.pathname + '/page' ||
          link.searchParams.getAll('pageId').length !== 1 || link.searchParams.get('pageId') !== hit.pageId ||
          link.searchParams.getAll('version').length !== 1 || link.searchParams.get('version') !== 'v1' ||
          [...link.searchParams.keys()].some(key => !['pageId', 'version'].includes(key))) throw Error('SEARCH_LINK_CANONICAL');
    }
  }

  async function http(type, query, context, signal) {
    const sentMs = now(), row = {record: 'http', ...context, type, queryId: query?.id ?? null, version: 'v1',
      sentMs, sentEpochMs: Date.now(), scheduledMs: context.scheduledMs ?? sentMs, bytes: 0, status: null, check: null};
    row.queueLagMs = sentMs - row.scheduledMs;
    let url = webBase + '/docs/p000001?version=v1';
    if (type === 'search') {
      const params = new URLSearchParams({q: query.q});if (query.spaceId) params.set('spaceId', query.spaceId);
      query.tags.forEach(tag => params.append('tagId', tag));url = config.baseUrl + '/search?' + params;
    }
    try {
      const response = await fetch(url, {headers: {'x-cap-identity': query?.identity ?? 'all', 'x-cap-lane': context.lane},
        signal: AbortSignal.any([abort.signal, ...(signal ? [signal] : []), AbortSignal.timeout(5000)]), redirect: 'error'});
      row.status = response.status;const bytes = Buffer.from(await response.arrayBuffer());row.bytes = bytes.length;row.responseComplete = true;
      if (response.status === 200) {
        if (type === 'html') verifyHtml(bytes.toString('utf8'));else verifySearch(JSON.parse(bytes), query.id);
        row.check = 'ok';
      } else {
        let json;try {json = JSON.parse(bytes);} catch {}
        row.errorCode = response.headers.get('x-cap-error') ?? json?.error?.code ?? json?.error ?? 'HTTP_' + response.status;
        if (['SEARCH_BUSY', 'CONTENT_BUSY', 'QUEUE_TIMEOUT'].includes(row.errorCode)) row.check = 'admission-rejection';
        else if (/HASH|INTEGRITY|IDENTITY|^OBJECT_SIZE$|^ARTIFACT_SIZE$/.test(row.errorCode)) throw Error('INTEGRITY_REJECTION:' + row.errorCode);
        else if (['QUERY_TIMEOUT', 'WORKER_EXIT', 'WORKER_UNAVAILABLE', 'WORKER_START_TIMEOUT', 'POOL_START_TIMEOUT',
          'DISK_FREE_GUARD', 'DISK_BUDGET_GUARD', 'OOM', 'HTTP_504'].includes(row.errorCode)) {
          row.check = 'capacity-stop';stopRun('capacity', String(row.errorCode));
        } else if (response.status >= 500) {row.check = 'service-stop';stopRun('service-unclassified', String(row.errorCode));}
        else throw Error('UNEXPECTED_HTTP_' + response.status + ':' + row.errorCode);
      }
    } catch (error) {
      row.error = String(error.message).slice(0, 240);
      if (stop && abort.signal.aborted) row.check = 'aborted-inflight';
      else if (error.name === 'TimeoutError' || error.name === 'AbortError') row.check = 'timeout';
      else if (error.message === 'fetch failed') {row.check = 'service-stop';stopRun('service-unclassified', 'TRANSPORT_FAILURE');}
      else {row.check = 'quality-failure';stopRun('quality', row.error);}
    }
    row.doneMs = now();row.doneEpochMs = Date.now();row.serviceMs = row.doneMs - sentMs;
    row.scheduledToDoneMs = row.doneMs - row.scheduledMs;log(row);return row;
  }

  async function status() {
    if (stop || statusBusy) return null;statusBusy = true;
    try {
      const response = await fetch(config.baseUrl + '/status', {signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]), redirect: 'error'});
      const json = await response.json();
      if (!response.ok) {stopRun('service-unclassified', 'STATUS_HTTP_' + response.status);return null;}
      const pids = readFileSync(path.join(config.readerCgroup, 'cgroup.procs'), 'utf8').trim().split('\n').filter(Boolean).map(Number);
      if (![json.pid, ...(json.workers ?? [])].every(pid => pids.includes(pid))) stopRun('instrument', 'READER_PROCESS_ESCAPED_CGROUP');
      if (json.fatal) stopRun('capacity', 'WORKER_FATAL:' + JSON.stringify(json.fatal));
      if (json.snapshotId !== 'v1') stopRun('quality', 'UNEXPECTED_VERSION_CHANGE');
      if (json.testHooks !== false) stopRun('instrument', 'TEST_HOOK_MUST_BE_DISABLED');
      appendFileSync(statusFile, JSON.stringify({at: new Date().toISOString(), ms: now(), ...json}) + '\n');return json;
    } catch (error) {if (!stop) stopRun('service-unclassified', 'STATUS_UNAVAILABLE:' + error.message);return null;}
    finally {statusBusy = false;}
  }

  async function searchJourney(query, context) {
    const sentMs = now(), row = {record: 'journey', ...context, type: 'web-search-journey', queryId: query.id, version: 'v1',
      sentMs, sentEpochMs: Date.now(), queueLagMs: sentMs - context.scheduledMs, bytes: 0, steps: [], check: null};
    const signal = AbortSignal.timeout(10000);
    for (const step of ['html', 'search']) {
      if (stop) {row.check = 'aborted-inflight';break;}
      const result = await http(step, query, {...context, scheduledMs: now(), journeyScheduledMs: context.scheduledMs}, signal);
      row.steps.push({type: step, queryId: result.queryId, check: result.check, status: result.status, serviceMs: result.serviceMs});row.bytes += result.bytes;
      if (result.check !== 'ok') {row.check = result.check;break;}
    }
    row.check ??= 'ok';row.doneMs = now();row.doneEpochMs = Date.now();row.serviceMs = row.doneMs - sentMs;
    row.scheduledToDoneMs = row.doneMs - row.scheduledMs;log(row);return row;
  }

  async function phase(name, searchRate, seconds) {
    const startMs = now(), lanes = [['reading', 1], ...(searchRate ? [['search', searchRate]] : [])];
    const rows = Object.fromEntries(lanes.map(([lane]) => [lane, []])), allPending = new Set();
    await Promise.all(lanes.map(async ([lane, rate]) => {
      const offered = rate * seconds, pending = new Set();let scheduled = 0;
      for (let i = 0; i < offered && !stop; i++) {
        const due = startMs + i * 1000 / rate;try {await sleep(due - now(), abort.signal);} catch {break;}
        if (stop) break;scheduled++;
        const context = {phase: name, lane, sequence: i, scheduledMs: due,
          queryId: lane === 'search' ? queries[i % queries.length].id : null};
        if (pending.size >= 64) {
          const end = now(), missed = {record: 'arrival', ...context, sentMs: null, doneMs: end, bytes: 0,
            queueLagMs: end - due, serviceMs: null, scheduledToDoneMs: end - due, check: 'generator-missed'};
          rows[lane].push(missed);log(missed);continue;
        }
        const job = (lane === 'reading' ? http('html', null, context) : searchJourney(queries[i % queries.length], context)).then(row => rows[lane].push(row));
        pending.add(job);allPending.add(job);job.finally(() => {pending.delete(job);allPending.delete(job);});
      }
      for (let i = scheduled; i < offered; i++) {
        const due = startMs + i * 1000 / rate, end = now(), row = {record: 'arrival', phase: name, lane, sequence: i,
          queryId: lane === 'search' ? queries[i % queries.length].id : null, scheduledMs: due, sentMs: null, doneMs: end,
          queueLagMs: 0, serviceMs: null, scheduledToDoneMs: Math.max(0, end - due), bytes: 0, check: 'aborted-after-stop'};
        rows[lane].push(row);log(row);
      }
    }));
    if (!stop) {try {await sleep(startMs + seconds * 1000 - now(), abort.signal);} catch {}}
    let drainTimer;
    const drained = await Promise.race([Promise.allSettled([...allPending]).then(() => true),
      new Promise(resolve => {drainTimer = setTimeout(() => resolve(false), 16000);})]);
    clearTimeout(drainTimer);if (!drained) stopRun('instrument', 'DRAIN_EXCEEDED_16_SECONDS');
    await Promise.allSettled([...allPending]);
    const elapsedMs = now() - startMs;
    const summaries = Object.fromEntries(lanes.map(([lane, rate]) => {
      const summary = summarize(rows[lane], rate * seconds, seconds);
      const latencyLimitMs = lane === 'search' ? 2000 : readingBaselineP95 === null ? 500 : Math.max(2 * readingBaselineP95, 500);
      const instrumentValid = summary.terminal === summary.offered && !summary.generatorLate && !summary.generatorMissed;
      const qualifies = !stop && instrumentValid && summary.failureFraction <= .01 && summary.successfulP95Ms !== null &&
        summary.successfulP95Ms <= latencyLimitMs && summary.allOfferedP95Ms <= latencyLimitMs;
      return [lane, {...summary, rate, latencyLimitMs, instrumentValid, qualifies,
        elapsedFulfilledPerSecond: summary.fulfilled / (elapsedMs / 1000),
        baselineScope: readingBaselineP95 === null ? 'Independent research start gate: reading P95 <= 500ms and failure <= 1%; not a company SLO' : undefined}];
    }));
    const perQuery = Object.fromEntries(queries.map(query => {
      const subset = (rows.search ?? []).filter(row => row.queryId === query.id);
      return [query.id, summarize(subset, subset.length, seconds)];
    }));
    const result = {name, searchRate, seconds, startMs, elapsedMs, lanes: summaries, perQuery,
      qualifies: Object.values(summaries).every(summary => summary.qualifies), stop};stages.push(result);
    writeFileSync(path.join(out, 'progress.json'), JSON.stringify({stop, readingBaselineP95, stages}, null, 2));return result;
  }

  const deadline = setTimeout(() => stopRun('instrument', 'TOTAL_DEADLINE_300_SECONDS'), 300000);
  let firstResources, lastResources;
  try {
    firstResources = resources(true);
    resourceTimer = setInterval(() => {try {resources();} catch (error) {stopRun('instrument', 'RESOURCE_SAMPLER:' + error.message);}}, 500);
    await status();statusTimer = setInterval(() => {if (!statusBusy && !stop) statusPending = status();}, 1000);
    if (!stop) {
      const probe = await http('html', null, {phase: 'preflight', lane: 'reading'});checks.push(probe);
      if (probe.check !== 'ok' && !stop) stopRun('service-unclassified', 'SSR_PREFLIGHT_UNAVAILABLE');
    }
    // Only small smoke validates all query shapes before phases. Formal performs
    // no extra expensive query warmup; source/reader correctness is checked online.
    if (args.mode === 'smoke') {
      for (const query of queries) {
        if (stop) break;const probe = await http('search', query, {phase: 'preflight', lane: 'search'});checks.push(probe);
        if (probe.check !== 'ok' && !stop) stopRun('service-unclassified', 'SEARCH_PREFLIGHT_UNAVAILABLE');
      }
    }
    if (!stop) {
      const baseline = await phase('reading-only-baseline', 0, args.mode === 'formal' ? 30 : 5);
      readingBaselineP95 = baseline.lanes.reading.successfulP95Ms;
      if (baseline.qualifies) for (const rate of args.mode === 'formal' ? [1, 2, 4] : [1]) {
        if (stop) break;const result = await phase('general-search-' + rate, rate, args.mode === 'formal' ? 30 : 5);
        if (!result.qualifies) break;highestQualifiedSearchRate = rate;
      }
    }
  } catch (error) {stopRun('instrument', 'HARNESS:' + error.message);}
  finally {
    clearInterval(resourceTimer);clearInterval(statusTimer);clearTimeout(deadline);await statusPending;
    try {lastResources = resources(true);} catch (error) {stopRun('instrument', 'FINAL_RESOURCE:' + error.message);}
    const plan = ['reading-only-baseline', ...(args.mode === 'formal' ? [1, 2, 4] : [1]).map(rate => 'general-search-' + rate)];
    const result = {schemaVersion: 3, candidate: 'C-only K3 Web-required synthetic server search tasks', mode: args.mode,
      startedAt, endedAt: new Date().toISOString(), elapsedMs: now(), sourceCount: oracle.sourceCount,
      oracleSha256: sha(oracleBytes), seed: oracle.seed, readingBaselineP95, highestQualifiedSearchRate, stop,
      thresholds: {readingRps: 1, searchRates: args.mode === 'formal' ? [1, 2, 4] : [1], phaseSeconds: args.mode === 'formal' ? 30 : 5,
        searchJourneyP95Ms: 2000, baselineReadingP95Ms: 500, readingP95: 'max(2 * reading baseline P95, 500ms)', failureFraction: .01,
        httpDeadlineMs: 5000, searchJourneyDeadlineMs: 10000, perLaneMaxInflight: 64, generatorLagMs: 250, drainMs: 16000, totalDeadlineMs: 300000},
      resourceBudget: groups.map(([name, , cpuMax, memoryMax]) => ({name, cpuMax, memoryMax, swapMax: 0})),
      stages, checks, firstResources, lastResources,
      unexecutedPhases: plan.filter(name => !stages.some(stage => stage.name === name)).map(name => ({name,
        reason: stop ? stop.category + ':' + stop.reason : 'Preceding phase failed lane threshold or generator validity; no fallback'})),
      generator: {nodeVersion: process.version, resourceUsageStart: generatorStart, resourceUsageEnd: process.resourceUsage()},
      limits: ['No consumer, bulk download, update or alternate configuration in this experiment',
        'Search journey: fixed published SSR page, then nine query shapes; validates results only and never reads unpublished tail hits',
        'Independent reading is the single fixed published p000001 hot page, not general or cold-content reading',
        'Web-required synthetic server search tasks: filters/identity are injected by the runner; existing UI support for all nine shapes is unverified',
        'HTTP SSR/API endpoints, not browser rendering/hydration, real editor, production ReBAC or real search quality acceptance',
        'Source oracle and arithmetic reused from frozen K2, not K2 capacity results',
        'Worker admission deadline includes queue and execution; unknown services are not presumed CPU saturation',
        'Short-window synthetic evidence; no A/B cost comparison and no automatic backup plan']};
    writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({out, stop, stages: stages.length, highestQualifiedSearchRate}));if (stop) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main(process.argv.slice(2));
