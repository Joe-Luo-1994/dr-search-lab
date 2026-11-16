import {mkdir, readFile} from 'node:fs/promises';
import {appendFileSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {source, eligible, snippet, parsePageId} from './source.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {reject(signal.reason);return;}
  const abort = () => {clearTimeout(timer);reject(signal.reason);};
  const timer = setTimeout(() => {signal?.removeEventListener('abort', abort);resolve();}, Math.max(0, ms));
  signal?.addEventListener('abort', abort, {once: true});
});
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stats = text => Object.fromEntries(text.trim().split('\n').filter(Boolean).map(line => {
  const [key, value] = line.trim().split(/\s+/);return [key, Number(value)];
}));
const escapeText = text => text.replace(/<!--[^]*?-->/g, '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) =>
  String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
  .replace(/&(quot|apos|lt|gt|amp);/g, (_, name) => ({quot: '"', apos: "'", lt: '<', gt: '>', amp: '&'}[name]));

export function summarize(rows, offered, seconds) {
  const sent = rows.filter(row => row.sentMs !== null), ok = rows.filter(row => row.check === 'ok');
  const count = check => rows.filter(row => row.check === check).length;
  const fulfilled = ok.length;
  return {offered, sent: sent.length, terminal: rows.length, fulfilled,
    fulfilledFraction: offered ? fulfilled / offered : null,
    failureFraction: offered ? (offered - fulfilled) / offered : null,
    needsResearch: count('needs-research'), rejected: count('admission-rejection'), timeouts: count('timeout'),
    abortedInflight: count('aborted-inflight'), abortedAfterStop: count('aborted-after-stop'),
    generatorMissed: count('generator-missed'), generatorLate: rows.filter(row => row.queueLagMs > 250).length,
    qualityFailures: count('quality-failure'), capacityStops: count('capacity-stop'), serviceStops: count('service-stop'),
    fulfilledPerSecond: fulfilled / seconds, sentPerSecond: sent.length / seconds,
    successfulP95Ms: percentile(ok.map(row => row.scheduledToDoneMs), .95),
    successfulServiceP95Ms: percentile(ok.map(row => row.serviceMs), .95),
    allSentP95Ms: percentile(sent.map(row => row.scheduledToDoneMs), .95),
    allOfferedP95Ms: percentile(rows.map(row => row.scheduledToDoneMs), .95),
    bytes: rows.reduce((sum, row) => sum + (row.bytes ?? 0), 0),
    outcomeCounts: Object.fromEntries([...new Set(rows.map(row => row.check))].map(check => [check, count(check)])),
  };
}

function argumentsOf(argv) {
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
  const options = argumentsOf(argv), config = JSON.parse(await readFile(options.config, 'utf8'));
  const oracleBytes = await readFile(options.oracle), oracle = JSON.parse(oracleBytes);
  const webBase = config.webBase ?? new URL(config.baseUrl).origin;
  if ([config.baseUrl, webBase].some(url => new URL(url).hostname !== '127.0.0.1')) throw Error('LOOPBACK_ONLY');
  const output = path.resolve(options.out);await mkdir(output);
  const rawFile = path.join(output, 'raw.ndjson'), resourceFile = path.join(output, 'resources.ndjson');
  const statusFile = path.join(output, 'status.ndjson');
  const beganAt = new Date().toISOString(), origin = performance.now(), generatorResourceUsageStart = process.resourceUsage();
  const clock = () => performance.now() - origin;
  const log = row => appendFileSync(rawFile, JSON.stringify(row) + '\n');
  const abort = new AbortController();let stop = null, activeVersion = 'v1', resourceTimer, statusTimer;
  let sampleCount = 0, statusBusy = false, statusPending = Promise.resolve(), baselineP95 = null, highestQualifiedConsumerRate = null;
  const stages = [], checks = [], updates = [], baselineMemoryEvents = new Map();
  const stopRun = (category, reason) => {
    if (!stop) {stop = {category, reason, at: new Date().toISOString(), ms: clock()};abort.abort();}
  };
  const versionData = Object.fromEntries(Object.entries(oracle.versions).map(([version, item]) => [version, {
    ...item, queriesById: new Map(item.queries.map(query => [query.id, query])),
    pagesById: new Map(item.pages.map(page => [page.pageId, page])),
    mediaById: new Map(item.media.map(media => [media.mediaId, media])),
  }]));
  const sourcePage = (id, version) => source(parsePageId(id, oracle.sourceCount, version), version, oracle.sourceCount);
  const readerCpu = config.readerCpu ?? 200, readerMemory = config.readerMemory ?? 1073741824;
  if (!Number.isInteger(readerCpu) || readerCpu < 1 || !Number.isSafeInteger(readerMemory) || readerMemory < 1) throw Error('INVALID_FROZEN_READER_BUDGET');
  const groupSpecs = [
    ['reader', config.readerCgroup, `${readerCpu * 1000} 100000`, readerMemory],
    ['minio', config.minioCgroup, '400000 100000', 4294967296],
  ];

  function sampleResources(forceAll = false) {
    if (config.diskGuardFile && existsSync(config.diskGuardFile)) stopRun('capacity', 'DISK_GUARD');
    const groups = {};
    for (const [name, directory, cpuMaxExpected, memoryMaxExpected] of groupSpecs) {
      if (name === 'minio' && !forceAll && sampleCount % 4 !== 0) continue;
      if (!directory || !path.isAbsolute(directory)) throw Error('CGROUP_PATH_REQUIRED:' + name);
      const read = file => readFileSync(path.join(directory, file), 'utf8').trim();
      const cpuMax = read('cpu.max'), memoryMax = Number(read('memory.max')), swapMax = Number(read('memory.swap.max'));
      if (cpuMax !== cpuMaxExpected || memoryMax !== memoryMaxExpected || swapMax !== 0) throw Error('CGROUP_LIMIT_MISMATCH:' + name);
      const events = stats(read('memory.events'));
      if (!baselineMemoryEvents.has(name)) baselineMemoryEvents.set(name, events);
      const baseline = baselineMemoryEvents.get(name);
      if ((events.oom ?? 0) > (baseline.oom ?? 0) || (events.oom_kill ?? 0) > (baseline.oom_kill ?? 0)) stopRun('capacity', 'CGROUP_OOM:' + name);
      groups[name] = {cpuMax, memoryMax, swapMax, current: Number(read('memory.current')), peak: Number(read('memory.peak')),
        cpu: stats(read('cpu.stat')), memory: stats(read('memory.stat')), events,
        processes: read('cgroup.procs').split('\n').filter(Boolean).map(Number),
        io: existsSync(path.join(directory, 'io.stat')) ? read('io.stat') : null};
      if (!groups[name].processes.length) stopRun('capacity', 'CGROUP_EMPTY:' + name);
    }
    sampleCount++;
    const row = {at: new Date().toISOString(), ms: clock(), groups};
    appendFileSync(resourceFile, JSON.stringify(row) + '\n');return row;
  }

  function verifySearch(json, queryId) {
    const data = versionData[json.snapshotId], query = data?.queriesById.get(queryId);
    if (!query || json.total !== query.total || !Array.isArray(json.hits) || json.hits.length !== Math.min(10, query.total)) throw Error('SEARCH_TOTAL_OR_LENGTH');
    const seen = new Set();
    for (const hit of json.hits) {
      const expected = sourcePage(hit.pageId, json.snapshotId);
      if (seen.has(hit.pageId) || !eligible(queryId, expected)) throw Error('SEARCH_ELIGIBILITY');
      seen.add(hit.pageId);
      if (hit.spaceId !== expected.spaceId || hit.title !== expected.title ||
          !same([...(hit.tagIds ?? [])].sort(), [...expected.tags].sort()) || hit.snippet !== snippet(expected.content)) throw Error('SEARCH_METADATA_OR_SNIPPET');
      if (!hit.url) throw Error('SEARCH_LINK_MISSING');
      const link = new URL(hit.url, config.baseUrl), api = new URL(config.baseUrl);
      if (link.origin !== api.origin || link.username || link.password || link.hash || link.pathname !== api.pathname + '/page' ||
          link.searchParams.getAll('pageId').length !== 1 || link.searchParams.get('pageId') !== hit.pageId ||
          link.searchParams.getAll('version').length !== 1 || link.searchParams.get('version') !== json.snapshotId ||
          [...link.searchParams.keys()].some(key => !['pageId', 'version'].includes(key))) throw Error('SEARCH_LINK_CANONICAL');
    }
    if (json.snapshotId === 'v2') activeVersion = 'v2';
  }

  function verifyPage(json, expectedVersion, pageId) {
    const expected = versionData[expectedVersion].pagesById.get(pageId);
    if (!expected || json.snapshotId !== expectedVersion || json.pageId !== pageId || typeof json.body !== 'string') throw Error('PAGE_IDENTITY');
    const bytes = Buffer.from(JSON.stringify({snapshotId: json.snapshotId, pageId: json.pageId, body: json.body}) + '\n');
    if (bytes.length !== expected.bodyBytes || sha(bytes) !== expected.bodySha) throw Error('PAGE_HASH');
  }

  function verifyHtml(html, expectedVersion, pageId) {
    const expected = sourcePage(pageId, expectedVersion), tag = html.match(/<main\b([^>]*)>/i)?.[1];
    if (!tag) throw Error('SSR_MAIN_MISSING');
    const attribute = name => tag.match(new RegExp('\\b' + name + '=["\']([^"\']*)["\']', 'i'))?.[1];
    if (attribute('data-pageid') !== pageId || attribute('data-version') !== expectedVersion) throw Error('SSR_IDENTITY');
    const title = html.match(/<h1\b[^>]*>([^]*?)<\/h1>/i)?.[1], body = html.match(/<pre\b[^>]*>([^]*?)<\/pre>/i)?.[1];
    if (title === undefined || body === undefined || escapeText(title) !== expected.title || escapeText(body) !== expected.content) throw Error('SSR_SOURCE_CONTENT');
  }

  function searchWork(sequence, version = activeVersion, queryIds = null) {
    const choices = queryIds ? queryIds.map(id => versionData[version].queriesById.get(id)) : versionData[version].queries;
    const query = choices[sequence % choices.length];
    const params = new URLSearchParams({q: query.q});if (query.spaceId) params.set('spaceId', query.spaceId);
    query.tags.forEach(tag => params.append('tagId', tag));
    return {type: 'search', url: config.baseUrl + '/search?' + params, identity: query.identity, queryId: query.id, version};
  }
  function pageWork(type, sequence, version = activeVersion) {
    const page = versionData[version].pages[sequence % Math.min(256, versionData[version].pages.length)];
    const params = new URLSearchParams({pageId: page.pageId, version});if (type === 'media') params.set('mediaId', page.mediaId);
    return {type, identity: 'all', version, pageId: page.pageId, mediaId: page.mediaId,
      url: type === 'html' ? webBase + '/docs/' + page.pageId + '?version=' + version : config.baseUrl + '/' + type + '?' + params};
  }

  async function http(work, context, {signal, deadline = 5000, expectedStatus = null, method = 'GET', body, admin = false} = {}) {
    const sentMs = clock(), row = {record: 'http', ...context, type: work.type, queryId: work.queryId ?? null,
      version: work.version ?? null, pageId: work.pageId ?? null, mediaId: work.mediaId ?? null,
      scheduledMs: context.scheduledMs ?? sentMs, sentMs, sentEpochMs: Date.now(), status: null, bytes: 0, check: null};
    row.queueLagMs = sentMs - row.scheduledMs;let json = null;
    try {
      const response = await fetch(work.url, {method,
        headers: {'x-cap-identity': work.identity ?? 'all', 'x-cap-lane': context.lane ?? 'control',
          ...(admin ? {'x-cap-admin': config.adminToken, 'content-type': 'application/json'} : {})},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.any([abort.signal, ...(signal ? [signal] : []), AbortSignal.timeout(deadline)]), redirect: 'error'});
      row.status = response.status;row.errorCode = response.headers.get('x-cap-error') ?? undefined;
      const bytes = Buffer.from(await response.arrayBuffer());row.bytes = bytes.length;row.responseComplete = true;
      if (work.type !== 'media' && work.type !== 'html') {try {json = JSON.parse(bytes);} catch {}}
      if (expectedStatus !== null && response.status === expectedStatus) {
        row.check = 'ok';
      } else if (response.status === 409) {
        if (!json && work.type === 'html') {try {json = JSON.parse(bytes);} catch {}}
        if ((response.headers.get('x-cap-error') ?? json?.error?.code) !== 'VERSION_MISMATCH') throw Error('UNEXPECTED_409_CONTRACT');
        row.check = 'needs-research';
      } else if (response.status >= 500 || response.status === 429) {
        if (!json) {try {json = JSON.parse(bytes);} catch {}}
        row.errorCode = response.headers.get('x-cap-error') ?? json?.error?.code ?? json?.error ?? 'HTTP_' + response.status;
        if (['SEARCH_BUSY', 'CONTENT_BUSY', 'QUEUE_TIMEOUT'].includes(row.errorCode)) row.check = 'admission-rejection';
        else if (/HASH|INTEGRITY|IDENTITY|^OBJECT_SIZE$|^ARTIFACT_SIZE$/.test(row.errorCode)) throw Error('INTEGRITY_REJECTION:' + row.errorCode);
        else if (['QUERY_TIMEOUT', 'WORKER_EXIT', 'WORKER_UNAVAILABLE', 'WORKER_START_TIMEOUT', 'POOL_START_TIMEOUT',
          'DISK_FREE_GUARD', 'DISK_BUDGET_GUARD', 'OOM', 'HTTP_504'].includes(row.errorCode)) {
          row.check = 'capacity-stop';stopRun('capacity', String(row.errorCode));
        } else {row.check = 'service-stop';stopRun('service-unclassified', String(row.errorCode));}
      } else if (expectedStatus !== null && response.status !== expectedStatus) throw Error('CONTROL_STATUS:' + response.status + ':expected:' + expectedStatus);
      else if (response.status !== 200) throw Error('UNEXPECTED_HTTP_' + response.status);
      else {
        if (work.type === 'search') {verifySearch(json, work.queryId);row.responseVersion = json.snapshotId;}
        else if (work.type === 'page') {verifyPage(json, work.version, work.pageId);row.responseVersion = json.snapshotId;}
        else if (work.type === 'media') {
          const expected = versionData[work.version].mediaById.get(work.mediaId);
          if (!expected || bytes.length !== expected.bytes || sha(bytes) !== expected.sha256) throw Error('MEDIA_HASH');
        } else if (work.type === 'html') {verifyHtml(bytes.toString('utf8'), work.version, work.pageId);row.responseVersion = work.version;}
        row.check = 'ok';
      }
    } catch (error) {
      row.error = String(error.message).slice(0, 240);
      if (stop && abort.signal.aborted) row.check = 'aborted-inflight';
      else if (error.name === 'TimeoutError' || error.name === 'AbortError') row.check = 'timeout';
      else if (error.message === 'fetch failed') {row.check = 'service-stop';stopRun('service-unclassified', 'TRANSPORT_FAILURE');}
      else {row.check = 'quality-failure';stopRun('quality', row.error);}
    }
    row.doneMs = clock();row.doneEpochMs = Date.now();row.serviceMs = row.doneMs - sentMs;
    row.scheduledToDoneMs = row.doneMs - row.scheduledMs;log(row);return {row, json};
  }

  async function control(route, {expectedStatus = 200, identity = 'all', method = 'GET', body, deadline = 5000, check} = {}) {
    if (stop) return null;
    const result = await http({type: 'control', url: config.baseUrl + route, identity}, {phase: 'control', lane: 'control'},
      {expectedStatus, method, body, deadline, admin: method === 'POST'});
    if (result.row.check !== 'ok') {
      if (!stop) stopRun(result.row.check === 'quality-failure' ? 'quality' : 'capacity', 'CONTROL:' + route + ':' + result.row.check);
    } else if (check) {
      try {check(result.json);} catch (error) {stopRun('quality', 'CONTROL_ORACLE:' + error.message);result.row.oracleError = error.message;}
    }
    checks.push({route, ...result});return result;
  }

  async function sampleStatus() {
    if (stop || statusBusy) return;
    statusBusy = true;
    try {
      const response = await fetch(config.baseUrl + '/status', {signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]), redirect: 'error'});
      const json = await response.json();
      if (!response.ok) {stopRun('service-unclassified', 'STATUS_HTTP_' + response.status);return;}
      const pids = readFileSync(path.join(config.readerCgroup, 'cgroup.procs'), 'utf8').trim().split('\n').filter(Boolean).map(Number);
      const activePids = [json.pid, ...(json.workers ?? [])];
      if (!activePids.every(pid => pids.includes(pid))) stopRun('instrument', 'READER_PROCESS_ESCAPED_CGROUP');
      if (json.fatal) stopRun('capacity', 'WORKER_FATAL:' + JSON.stringify(json.fatal));
      appendFileSync(statusFile, JSON.stringify({at: new Date().toISOString(), ms: clock(), ...json}) + '\n');
    } catch (error) {if (!stop) stopRun('service-unclassified', 'STATUS_UNAVAILABLE:' + error.message);}
    finally {statusBusy = false;}
  }

  async function journey(sequence, context) {
    const sentMs = clock(), row = {record: 'journey', ...context, type: 'web-journey', sentMs,
      sentEpochMs: Date.now(), queueLagMs: sentMs - context.scheduledMs, bytes: 0, check: null, steps: []};
    const signal = AbortSignal.timeout(15000);const initialVersion = activeVersion;
    let version = initialVersion, selectedHit = null;
    for (const step of ['html', 'search', 'page']) {
      if (stop) {row.check = 'aborted-inflight';break;}
      let work;
      if (step === 'search') work = searchWork(sequence, version, ['rare', 'pdf']);
      else if (step === 'page') {
        if (!selectedHit || !versionData[version].pagesById.has(selectedHit.pageId)) {
          row.check = 'quality-failure';stopRun('quality', 'WEB_SEARCH_HIT_NOT_PUBLISHED');break;
        }
        work = {type: 'page', identity: 'all', version, pageId: selectedHit.pageId,
          url: new URL(selectedHit.url, config.baseUrl).href};
      } else work = pageWork(step, sequence, version);
      const result = await http(work, {...context, record: 'http', step, scheduledMs: clock(), journeyScheduledMs: context.scheduledMs}, {signal});
      row.steps.push({type: step, check: result.row.check, status: result.row.status, serviceMs: result.row.serviceMs,
        version: result.row.responseVersion ?? work.version, queryId: work.queryId ?? null});
      row.bytes += result.row.bytes;
      if (result.row.check !== 'ok') {row.check = result.row.check;break;}
      if (step === 'search') {version = result.json.snapshotId;selectedHit = result.json.hits[0];}
    }
    row.check ??= 'ok';row.initialVersion = initialVersion;row.finalVersion = version;
    row.doneMs = clock();row.doneEpochMs = Date.now();row.serviceMs = row.doneMs - sentMs;
    row.scheduledToDoneMs = row.doneMs - row.scheduledMs;log(row);return row;
  }

  async function phase(name, {seconds, consumerRate = 0, bulkRate = 0, update = false} = {}) {
    const start = clock(), startEpochMs = Date.now(), lanePlans = [['web', 1], ['consumer', consumerRate], ['bulk', bulkRate]].filter(([, rate]) => rate > 0);
    const laneRows = Object.fromEntries(lanePlans.map(([lane]) => [lane, []]));
    const inFlight = new Set();let updateTimer, updatePromise = null;
    if (update) updateTimer = setTimeout(() => {
      if (stop) return;
      const record = {phase: name, requestStartedEpochMs: Date.now(), requestStartedMs: clock()};updates.push(record);
      updatePromise = control('/update', {method: 'POST', body: {version: 'v2'}, deadline: options.mode === 'formal' ? 150000 : 15000})
        .then(result => {record.requestEndedEpochMs = Date.now();record.requestEndedMs = clock();record.result = result;
          if (result?.row.check === 'ok' && result.json?.snapshotId === 'v2') activeVersion = 'v2';
          else if (!stop) stopRun('capacity', 'UPDATE_NOT_COMPLETE');});
    }, 5000);
    await Promise.all(lanePlans.map(async ([lane, rate]) => {
      const offered = Math.floor(rate * seconds), pending = new Set();let scheduled = 0;
      for (let i = 0; i < offered && !stop; i++) {
        const due = start + i * 1000 / rate;
        try {await sleep(due - clock(), abort.signal);} catch {break;}
        if (stop) break;
        scheduled++;
        const context = {phase: name, lane, sequence: i, scheduledMs: due};
        if (pending.size >= 64) {
          const end = clock(), missed = {record: 'arrival', ...context, sentMs: null, doneMs: end, queueLagMs: end - due,
            serviceMs: null, scheduledToDoneMs: end - due, bytes: 0, check: 'generator-missed'};
          log(missed);laneRows[lane].push(missed);continue;
        }
        const promise = (lane === 'web' ? journey(i, context) : http(lane === 'consumer' ? searchWork(i) : pageWork('media', i), context).then(x => x.row))
          .then(row => laneRows[lane].push(row));
        pending.add(promise);inFlight.add(promise);
        promise.finally(() => {pending.delete(promise);inFlight.delete(promise);});
      }
      for (let i = scheduled; i < offered; i++) {
        const due = start + i * 1000 / rate, end = clock(), row = {record: 'arrival', phase: name, lane, sequence: i,
          scheduledMs: due, sentMs: null, doneMs: end, queueLagMs: 0, serviceMs: null,
          scheduledToDoneMs: Math.max(0, end - due), bytes: 0, check: 'aborted-after-stop'};
        log(row);laneRows[lane].push(row);
      }
    }));
    if (!stop) {try {await sleep(start + seconds * 1000 - clock(), abort.signal);} catch {}}
    clearTimeout(updateTimer);
    let drainTimer;
    const drained = await Promise.race([Promise.allSettled([...inFlight]).then(() => true),
      new Promise(resolve => {drainTimer = setTimeout(() => resolve(false), 16000);})]);
    clearTimeout(drainTimer);
    if (!drained) stopRun('instrument', 'DRAIN_EXCEEDED_16_SECONDS');
    await Promise.allSettled([...inFlight]);if (updatePromise) await updatePromise;
    const elapsedMs = clock() - start;
    const summaries = Object.fromEntries(lanePlans.map(([lane, rate]) => {
      const summary = summarize(laneRows[lane], Math.floor(rate * seconds), seconds);
      const latencyLimitMs = lane === 'web' ? Math.min(3000, baselineP95 === null ? 3000 : Math.max(2 * baselineP95, 500)) : 2000;
      const instrumentValid = summary.terminal === summary.offered && !summary.generatorMissed && !summary.generatorLate;
      // Stale-version journeys remain unfulfilled and contribute to this per-lane failure fraction.
      const qualifies = !stop && instrumentValid && summary.failureFraction <= .01 && summary.successfulP95Ms !== null &&
        summary.successfulP95Ms <= latencyLimitMs && summary.allOfferedP95Ms <= latencyLimitMs;
      return [lane, {...summary, rate, latencyLimitMs, instrumentValid, qualifies,
        elapsedFulfilledPerSecond: summary.fulfilled / (elapsedMs / 1000)}];
    }));
    let updateEvidence = null;
    if (update) {
      const receipt = updates.at(-1)?.result?.json;
      const all = Object.values(laneRows).flat(), succeeded = all.filter(row => row.check === 'ok');
      const overlap = receipt ? all.filter(row => row.sentEpochMs < receipt.downloadEndedMs && row.doneEpochMs > receipt.downloadStartedMs).length : 0;
      const v1 = succeeded.filter(row => (row.responseVersion ?? row.finalVersion) === 'v1').length;
      const v2 = succeeded.filter(row => (row.responseVersion ?? row.finalVersion) === 'v2').length;
      const afterActivationSeconds = receipt ? (startEpochMs + seconds * 1000 - receipt.activatedMs) / 1000 : null;
      const evidenceComplete = !!receipt && Number.isFinite(receipt.downloadStartedMs) && receipt.downloadEndedMs >= receipt.downloadStartedMs &&
        receipt.activatedMs >= receipt.downloadEndedMs && receipt.snapshotId === 'v2' && overlap > 0 && v1 > 0 && v2 > 0 &&
        receipt.activatedMs <= startEpochMs + (options.mode === 'formal' ? 155000 : 18000) &&
        afterActivationSeconds >= (options.mode === 'formal' ? 20 : 2);
      updateEvidence = {receipt: receipt ?? null, overlap, v1SuccessfulOperations: v1, v2SuccessfulOperations: v2,
        afterActivationSeconds, evidenceComplete,
        activationSpanningRequests: receipt ? all.filter(row => row.sentEpochMs < receipt.activatedMs && row.doneEpochMs > receipt.activatedMs).length : 0};
    }
    const qualifies = Object.values(summaries).every(summary => summary.qualifies) && (!update || updateEvidence.evidenceComplete);
    const result = {name, startMs: start, startEpochMs, elapsedMs, seconds, consumerRate, bulkRate, lanes: summaries,
      updateEvidence, qualifies, stop};stages.push(result);
    writeFileSync(path.join(output, 'progress.json'), JSON.stringify({stop, baselineP95, stages, updates}, null, 2));
    return result;
  }

  const deadline = setTimeout(() => stopRun('instrument', 'TOTAL_DEADLINE_900_SECONDS'), 900000);
  let firstResources, lastResources;
  try {
    firstResources = sampleResources(true);
    resourceTimer = setInterval(() => {try {sampleResources();} catch (error) {stopRun('instrument', 'RESOURCE_SAMPLER:' + error.message);}}, 500);
    await control('/status', {check: json => {
      if (json.fatal) {stopRun('capacity', 'START_WORKER_FATAL');return;}
      if (json.snapshotId !== 'v1') throw Error('HEALTHY_V1_REQUIRED');
      if (options.mode === 'formal' && json.testHooks !== false) throw Error('FORMAL_TEST_HOOK_MUST_BE_DISABLED');
    }});
    if (!stop) await sampleStatus();
    statusTimer = setInterval(() => {if (!statusBusy && !stop) statusPending = sampleStatus();}, 1000);
    await control('/search?q=disaster', {identity: 'unknown', expectedStatus: 503,
      check: json => {if (json.error?.code !== 'AUTHORIZATION_UNKNOWN') throw Error('UNKNOWN_AUTH');}});
    await control('/search?q=disaster', {identity: 'none', check: json => {if (json.total !== 0 || json.hits.length) throw Error('NONE_SEARCH_LEAK');}});
    await control('/page?pageId=p000001&version=v0', {expectedStatus: 409,
      check: json => {if (json.error?.code !== 'VERSION_MISMATCH') throw Error('STALE_VERSION');}});
    await control('/page?pageId=p000001&version=v1', {identity: 'none', expectedStatus: 404});
    await control('/media?pageId=p000001&mediaId=m1&version=v1', {expectedStatus: 404});
    for (const [identity, version, expectedStatus, errorCode] of [
      ['unknown', 'v1', 503, 'AUTHORIZATION_UNKNOWN'], ['none', 'v1', 404, 'NOT_FOUND'], ['all', 'v0', 409, 'VERSION_MISMATCH'],
    ]) {
      if (stop) break;
      const result = await http({type: 'html', url: webBase + '/docs/p000001?version=' + version,
        version, pageId: 'p000001', identity}, {phase: 'contract', lane: 'contract'}, {expectedStatus});
      checks.push({route: 'SSR denial ' + identity + '/' + version, ...result});
      if (result.row.check !== 'ok' && !stop) stopRun('capacity', 'SSR_DENIAL_UNAVAILABLE');
      if (result.row.check === 'ok' && result.row.errorCode !== errorCode) stopRun('quality', 'SSR_DENIAL_ERROR_CODE');
    }
    for (let i = 0; i < versionData.v1.queries.length && !stop; i++) {
      const result = await http(searchWork(i, 'v1'), {phase: 'contract', lane: 'contract'});
      if (result.row.check !== 'ok' && !stop) stopRun('capacity', 'CONTRACT_QUERY_UNAVAILABLE:' + result.row.check);
    }
    for (let i = 0; i < 8 && !stop; i++) {
      for (const type of ['html', 'page', 'media']) {
        const result = await http(pageWork(type, i, 'v1'), {phase: 'contract', lane: 'contract'});
        if (result.row.check !== 'ok' && !stop) stopRun('capacity', 'CONTRACT_CONTENT_UNAVAILABLE:' + result.row.check);
      }
    }
    if (!stop) {
      const baseline = await phase('web-only-baseline', {seconds: options.mode === 'formal' ? 30 : 5});
      baselineP95 = baseline.lanes.web.successfulP95Ms;
      let highest = null;
      if (baseline.qualifies) {
        for (const rate of options.mode === 'formal' ? [1, 2, 4, 8, 16] : [1]) {
          if (stop) break;
          const result = await phase('consumer-' + rate, {seconds: options.mode === 'formal' ? 30 : 5, consumerRate: rate});
          if (!result.qualifies) break;highest = rate;highestQualifiedConsumerRate = rate;
        }
      }
      if (!stop && highest !== null) {
        const bulk = await phase('consumer-plus-bulk', {seconds: options.mode === 'formal' ? 30 : 5, consumerRate: highest, bulkRate: 2});
        if (!stop && bulk.qualifies) {
          await phase('consumer-bulk-update', {seconds: options.mode === 'formal' ? 180 : 20, consumerRate: highest, bulkRate: 2, update: true});
          if (!stop && activeVersion === 'v2') {
            await control('/page?pageId=p000001&version=v1', {expectedStatus: 409});
            await control('/page?pageId=p000001&version=v2', {identity: 'a', expectedStatus: 404});
            for (let i = 0; i < versionData.v2.queries.length && !stop; i++) {
              const result = await http(searchWork(i, 'v2'), {phase: 'post-update', lane: 'contract'});
              if (result.row.check !== 'ok' && !stop) stopRun('capacity', 'POST_UPDATE_SEARCH_UNAVAILABLE');
            }
            for (const type of ['html', 'page', 'media']) {
              if (stop) break;
              const result = await http(pageWork(type, 2, 'v2'), {phase: 'post-update', lane: 'contract'});
              if (result.row.check !== 'ok' && !stop) stopRun('capacity', 'POST_UPDATE_CONTENT_UNAVAILABLE');
            }
          }
        }
      }
    }
  } catch (error) {stopRun('instrument', 'HARNESS:' + error.message);}
  finally {
    clearInterval(resourceTimer);clearInterval(statusTimer);clearTimeout(deadline);
    await statusPending;
    try {lastResources = sampleResources(true);} catch (error) {stopRun('instrument', 'FINAL_RESOURCE:' + error.message);}
    const result = {schemaVersion: 2, candidate: 'C-only', beganAt, endedAt: new Date().toISOString(), elapsedMs: clock(),
      mode: options.mode, oracleSha256: sha(oracleBytes), sourceCount: oracle.sourceCount, seed: oracle.seed,
      sourceOracle: 'Pure deterministic source module, independent of SQL and reader responses',
      coverage: 'Full searchable corpus; fixed 256-page remote body hotset and 8 media objects; not full content/cold access coverage',
      rankingScope: oracle.rankingContract, baselineP95, highestQualifiedConsumerRate, stop,
      thresholds: {webRps: 1, webJourneyDeadlineMs: 15000, httpDeadlineMs: 5000, webP95Ms: 3000,
        webRelativeP95: 'max(2 * baselineP95, 500ms)', consumerP95Ms: 2000, failureFraction: .01,
        generatorLagMs: 250, perLaneMaxInflight: 64, drainMs: 16000, totalDeadlineMs: 900000},
      resourceBudget: groupSpecs.map(([name, , cpuMax, memoryMax]) => ({name, cpuMax, memoryMax, swapMax: 0})),
      stages, updates, checks, firstResources, lastResources,
      generator: {nodeVersion: process.version, pid: process.pid, resourceUsageStart: generatorResourceUsageStart,
        resourceUsageEnd: process.resourceUsage(), note: 'Outside reader/MinIO budgets; process maxRSS is a cumulative process peak, not a per-phase peak'},
      unexecutedPhases: ['web-only-baseline', ...(options.mode === 'formal' ? [1, 2, 4, 8, 16] : [1]).map(rate => 'consumer-' + rate),
        'consumer-plus-bulk', 'consumer-bulk-update'].filter(name => !stages.some(stage => stage.name === name)).map(name => ({name,
          reason: stop ? stop.category + ':' + stop.reason : 'Prerequisite lane threshold or generator-validity gate did not qualify'})),
      limits: ['Short synthetic windows, not production SLO', 'Web search alternates rare and published-marker queries, then reads the actual first returned hit; not broad Web query coverage',
        'SSR endpoint verified; no browser hydration, rendering or human UX claim',
        'One shared reader budget; separate larger MinIO budget does not prove MinIO is not a bottleneck',
        'Worker deadline includes admission queue and execution; timeout is not proof of SQL execution taking four seconds',
        'Highest qualified consumer rate is an observed lower bound, not maximum system capacity',
        'No A or B comparison', 'All 409 remain unfulfilled user journeys requiring research/retry']};
    writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({output, mode: options.mode, stop, stages: stages.length, elapsedMs: result.elapsedMs}));
    if (stop) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main(process.argv.slice(2));
