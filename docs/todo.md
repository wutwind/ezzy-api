# TODO and open questions

Working notes for features that have a direction but are not fully designed. Completed work is
removed from this file and recorded in the changelog and release plans.

## 1. Timeouts and cancellation

Calls already accept an `AbortSignal`. It passes through transport interceptors to `fetch`, and
cancellation returns a distinct `AbortError`.

The remaining design work includes:

- client-level timeouts with a per-call override;
- a distinct `TimeoutError`, separate from `AbortError` and `TransportError`;
- combining a caller-provided signal with the timeout signal.

## 2. Interceptor extensions

The current transport interceptors can handle authentication, headers, correlation IDs, HTTP
logging, metrics, and retry policies. Possible later work:

- higher-level middleware that can inspect parsed `ApiError` values or typed results;
- explicit idempotency rules for retries;
- API-level or endpoint-level interceptors in addition to client interceptors.

## 3. File transfers and progress

Progress belongs to the transport layer because events occur while bytes are sent or received.
Potential per-call callbacks could be passed through `TransportRequest`, while each transport would
implement the actual accounting.

Design constraints:

- fetch download progress can use `Response.body`, but the total is known only with an accurate
  `Content-Length` header;
- browser Fetch does not provide reliable upload progress, so that requires XHR or another custom
  transport;
- `createApiClient({ transport })` already accepts a custom transport;
- binary request and response contracts must be designed before exposing a progress API.

Do not promise progress in the built-in fetch transport until binary bodies and responses are
defined.

## Deferred

- Continuous integration: `npm run check` currently runs only locally.
- Retries, authentication helpers, multipart bodies, streaming, optional path parameters,
  wildcards, and catch-all paths.
