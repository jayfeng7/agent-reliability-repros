# Agent reliability reproductions

Small, runnable reproductions of agent SDK behavior. This repository currently contains one Mastra fetch-cancellation case. It demonstrates a reported behavior; it is not an upstream fix or an accepted contribution.

## Mastra: cancellation is retried after AbortSignal fires

The public `fetchWithRetry` export accepts `RequestInit.signal`. With three attempts, an already-aborted signal still triggers three fetch invocations and two backoff waits (2 seconds + 4 seconds). Aborting during the first backoff has the same delayed settlement.

### Run

Requirements: Node.js 24 (verified with 24.20.0), npm, and localhost networking. No API keys, LLM calls, external HTTP requests during the reproduction, or services are required. Installation downloads npm dependencies.

```sh
npm ci --ignore-scripts
npm run repro
```

The script imports the real `@mastra/core/utils` public API, wraps native fetch only to count calls, and starts a local HTTP server returning 503. Timers are real. It completes in approximately 12 seconds and closes the local server.

### Observed results

Verified on Windows with `@mastra/core` 1.74.0:

| Case | Fetch invocations | HTTP requests reaching the server | Settlement time |
| --- | ---: | ---: | ---: |
| Native fetch, already aborted | 1 | 0 | 1 ms |
| fetchWithRetry, already aborted | 3 | 0 | 6017 ms |
| fetchWithRetry, abort after 250 ms during backoff | 3 | 1 | 6046 ms |

The first case is a control. The latter two assert the current buggy behavior, so a successful script run confirms reproduction, not correct cancellation. Counts measure API invocations; no extra HTTP requests reach the server after cancellation.

Expected: an already-aborted request should settle promptly; cancellation during backoff should stop the wait and prevent later attempts. Transient failures without cancellation should continue to retry normally.

The same behavior was verified separately against the unchanged upstream source at commit [`1561da9a1bc45014e7975e15144310a9e70c0128`](https://github.com/mastra-ai/mastra/blob/1561da9a1bc45014e7975e15144310a9e70c0128/packages/core/src/utils/fetchWithRetry.ts). That source is not vendored here.

### Scope and status

- Scope: `fetchWithRetry` cancellation and its backoff only. This does not demonstrate a failure of `Agent.generate`, model-provider retry paths, or asset-download cancellation.
- Upstream issue: not submitted as of 2026-10-03.
- Upstream fix/PR: none from this repository. Any follow-up requires maintainer approval under Mastra's contribution rules.
- The reproduction and report were prepared with AI assistance; the commands were executed locally. The account owner should review the code and reproduce it before presenting it as work they understand.

## License

Reproduction code: MIT. The installed Mastra package retains its own license.
