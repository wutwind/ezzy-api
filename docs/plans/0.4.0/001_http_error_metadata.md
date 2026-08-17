# 001 — HTTP error metadata

Status: **ready after 0.3.0**
Branch: `feat/http-error-body`
Depends on: 0.2.0 no-throw API
Release request: [`../0.4.0.md`](../0.4.0.md)

## Goal

Expose response headers and a best-effort decoded JSON value without losing the raw error body.

`HttpError` gains `headers: TransportHeaders` and `json?: unknown`. The body remains the source of
truth. JSON parse failure never replaces the HTTP error.

Headers are required for values such as `Retry-After` and server request identifiers used for log
correlation. Parsed JSON lets consumers validate a stable backend error envelope without repeating
their own `JSON.parse` try/catch pipeline.

Recognize `application/json` and media types with the `+json` suffix, ignoring case and parameters.
Do not guess JSON when Content-Type is absent or non-JSON.

## Tests

- headers reach the error;
- standard JSON and `application/problem+json` are parsed;
- media type matching ignores case and parameters;
- malformed JSON leaves `json` absent and body intact;
- HTML or missing Content-Type leaves `json` absent;
- empty JSON error body leaves `json` absent.

This is source-compatible for ordinary narrowing but can affect consumers constructing `HttpError`
mocks, so avoid describing it as universally non-breaking.
