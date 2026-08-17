# 001 — Typed endpoint error responses

Status: **deferred from 0.2.0**
Release request: [`../0.6.0.md`](../0.6.0.md)

Add an optional error-response schema per endpoint so non-2xx JSON bodies can be validated and
exposed as endpoint-specific typed data.

This requires designing `ApiError<TEndpoint>` and threading the endpoint type through
`EndpointMethod`, `ApiClient`, `AnyEndpoint`, `EndpointDefinition`, and `ValidateEndpoint`. Decide
whether schema failure preserves the ordinary `HttpError`, produces a nested validation failure, or
adds validation metadata while retaining status/body/headers.

The 0.2.0 HTTP metadata task provides `json: unknown` as the migration bridge.
