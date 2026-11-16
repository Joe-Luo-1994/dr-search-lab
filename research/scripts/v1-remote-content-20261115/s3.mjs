import {createHash, createHmac} from 'node:crypto';
import {readFile, appendFile} from 'node:fs/promises';

const sha = b => createHash('sha256').update(b).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export const objectLimit = 1024 * 1024;
export async function config() {
  const c = JSON.parse(await readFile(process.env.REMOTE_CONFIG_PATH, 'utf8'));
  if (c.endpoint !== 'http://127.0.0.1:19440' || c.bucket !== 'dr-remote-20261115') throw Error('INVALID_REMOTE_CONFIG');
  return c;
}
export async function s3(method, key = '', {body = Buffer.alloc(0), signal, bucketOnly = false, anonymous = false, limit = objectLimit} = {}) {
  const c = await config();
  if (key && (!/^[a-zA-Z0-9./_-]+$/.test(key) || key.includes('..') || key.startsWith('/'))) throw Error('INVALID_OBJECT_KEY');
  const uri = '/' + c.bucket + (bucketOnly ? '' : '/' + key.split('/').map(encode).join('/'));
  const url = c.endpoint + uri;
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = stamp.slice(0, 8), scope = day + '/us-east-1/s3/aws4_request';
  const payloadHash = sha(body);
  const canonicalHeaders = 'host:127.0.0.1:19440\nx-amz-content-sha256:' + payloadHash + '\nx-amz-date:' + stamp + '\n';
  const names = 'host;x-amz-content-sha256;x-amz-date';
  const canonical = [method, uri, '', canonicalHeaders, names, payloadHash].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + c.secretKey, day), 'us-east-1'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(['AWS4-HMAC-SHA256', stamp, scope, sha(canonical)].join('\n')).digest('hex');
  const headers = anonymous ? {} : {'x-amz-date': stamp, 'x-amz-content-sha256': payloadHash,
    authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKey}/${scope}, SignedHeaders=${names}, Signature=${signature}`};
  const began = performance.now();
  let status = null, count = 0, fault = null, responseSha256 = null;
  try {
    const response = await fetch(url, {method, headers, body: method === 'PUT' ? body : undefined,
      redirect: 'error', signal: signal ?? AbortSignal.timeout(4000)});
    status = response.status;
    const chunks = [];
    for await (const chunk of response.body ?? []) {
      count += chunk.length;
      if (count > limit) throw Error('REMOTE_OBJECT_TOO_LARGE');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);responseSha256 = sha(bytes);
    return {status, bytes, headers: Object.fromEntries(response.headers)};
  } catch (error) {
    fault = error.code ?? error.name;
    throw error;
  } finally {
    if (process.env.REMOTE_IO_LOG) await appendFile(process.env.REMOTE_IO_LOG, JSON.stringify({
      at: new Date().toISOString(), pid: process.pid, method, key, anonymous, status,
      responseBytes: count, responseSha256, requestBytes: body.length, elapsedMs: performance.now() - began, fault,
    }) + '\n');
  }
}
export async function getRemoteObject(descriptor, {signal} = {}) {
  if (!descriptor || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 || descriptor.bytes > objectLimit ||
      !/^[a-f0-9]{64}$/.test(descriptor.sha256)) throw Object.assign(Error('CONTENT_INTEGRITY_MISMATCH'), {code:'CONTENT_INTEGRITY_MISMATCH'});
  let result;
  try { result = await s3('GET', descriptor.key, {signal}); }
  catch (cause) {
    const code = cause.message === 'REMOTE_OBJECT_TOO_LARGE' ? 'CONTENT_INTEGRITY_MISMATCH' : 'CONTENT_UNAVAILABLE';
    throw Object.assign(Error(code, {cause}), {code});
  }
  if (result.status !== 200) throw Object.assign(Error('CONTENT_UNAVAILABLE'), {code:'CONTENT_UNAVAILABLE'});
  if (result.bytes.length !== descriptor.bytes || sha(result.bytes) !== descriptor.sha256) {
    throw Object.assign(Error('CONTENT_INTEGRITY_MISMATCH'), {code:'CONTENT_INTEGRITY_MISMATCH'});
  }
  return result.bytes;
}
