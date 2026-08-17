# 001 — Timeout design and implementation

Status: **design discussion required before implementation**
Branch: `feat/timeout`
Depends on: 0.2.0 no-throw API
Release request: [`../0.3.0.md`](../0.3.0.md)

## Goal

Provide a library-owned timeout distinguishable from caller cancellation without allowing retries or
interceptors to make the advertised limit misleading.

The distinction is operationally important: a backend timeout should be surfaced and logged, while
caller cancellation commonly means the upstream client disconnected and requires no error report.

## Proposed contract for discussion

```ts
interface TimeoutOptions {
    readonly timeoutMs?: number | false;
}

interface TimeoutError {
    readonly type: 'TimeoutError';
    readonly timeoutMs: number;
}
```

- client value is the default;
- call value overrides it;
- `undefined` inherits and `false` disables the client default;
- a positive finite integer enables the timeout;
- zero, negative, fractional, `NaN`, and infinite values return typed configuration/request errors;
- only a timeout created from `timeoutMs` becomes `TimeoutError`;
- an externally supplied signal, including `AbortSignal.timeout()`, remains `AbortError`.

## Recommended semantic model

Treat `timeoutMs` as one end-to-end deadline for endpoint execution after request validation and
construction. It covers interceptors, retry attempts, retry backoff, and transport I/O. A per-attempt
timeout is a separate future retry-policy feature.

The endpoint layer owns the timer and passes a composed signal through `TransportRequest`. It also
races the pipeline against the deadline so a custom interceptor/transport that ignores the signal
cannot prevent the caller from receiving `TimeoutError`. Such ignored work cannot be forcibly stopped
by JavaScript; custom extensions are required to observe the signal.

The first cancellation event wins and its source must be recorded when it happens. Classification
must not be inferred later from the current state of two signals.

## Decisions required

- Confirm that validation and request construction are outside the timeout.
- Confirm end-to-end rather than per-attempt semantics.
- Confirm `timeoutMs` naming and `false` as the override that disables a default.
- Decide whether an absolute deadline should be exposed as transport metadata in addition to signal.
- Define cleanup and observation of a pipeline that loses the timeout race but ignores cancellation.

## Required tests after design approval

- timeout and caller cancellation produce distinct errors;
- already-aborted caller signal wins without creating a timer;
- first event deterministically wins when cancellation and deadline race;
- call override and explicit disable work;
- retries cannot extend the total deadline;
- signal-ignoring custom transport cannot delay the returned TimeoutError;
- timer is cleared/unrefed after every completion path;
- late rejection from losing background work cannot become unhandled.

Adding `TimeoutError` widens `ApiError` and must be called out as a pre-1.0 breaking type change.

## Related release work

- Export `TimeoutError` and `isTimeoutError(value: unknown)`.
- Document composition with caller signals.
- Document how the deadline interacts with retry interceptors.
- Until this API ships, document `AbortSignal.timeout()` plus `AbortSignal.any()` as the workaround.
