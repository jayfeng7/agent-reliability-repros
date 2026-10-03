import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';

// By default this exercises the published public API. Supplying a file URL
// additionally verifies the unchanged, pinned upstream source.
const moduleUrl = process.env.REPRO_SOURCE_URL || '@mastra/core/utils';
const { fetchWithRetry } = await import(moduleUrl);
const nativeFetch = globalThis.fetch;
let calls = 0;
let hits = 0;
globalThis.fetch = (...args) => {
  calls += 1;
  return nativeFetch(...args);
};
const server = createServer((_request, response) => {
  hits += 1;
  response.writeHead(503);
  response.end('retryable failure');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

async function measure(label, operation, expectedCalls, expectedHits, minMs = 0) {
  calls = hits = 0;
  const started = performance.now();
  const error = await operation().then(() => null, error => error);
  const elapsedMs = Math.round(performance.now() - started);
  const result = { case: label, calls, serverHits: hits, elapsedMs, error: error?.name };
  console.log(JSON.stringify(result));
  assert.equal(error?.name, 'AbortError');
  assert.equal(calls, expectedCalls);
  assert.equal(hits, expectedHits);
  assert.ok(elapsedMs >= minMs);
}

try {
  console.log(JSON.stringify({ node: process.version, module: moduleUrl, network: 'loopback only' }));
  const aborted = AbortSignal.abort(new DOMException('cancelled', 'AbortError'));
  await measure('native fetch / already aborted', () => fetch(url, { signal: aborted }), 1, 0);
  await measure('fetchWithRetry / already aborted',
    () => fetchWithRetry(url, { signal: aborted }, 3), 3, 0, 5900);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 250);
  try {
    await measure('fetchWithRetry / abort during first backoff',
      () => fetchWithRetry(url, { signal: controller.signal }, 3), 3, 1, 5900);
  } finally {
    clearTimeout(timer);
  }
  console.log('CONFIRMED: cancellation still waits through the 2s + 4s retry delays');
} finally {
  globalThis.fetch = nativeFetch;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
