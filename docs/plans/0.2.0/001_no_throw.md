# 001 — No-throw endpoint execution

Status: **implemented**
Branch: `feat/no-throw`
Release request: [`../0.2.0.md`](../0.2.0.md)

## Goal

Recoverable failures during endpoint execution must never escape as thrown exceptions. Invalid
constructor configuration and API definitions fail immediately with typed exceptions.

The enforceable guarantee is:

> Exceptions raised by platform APIs or user-provided schemas, transports, interceptors, fetch
> implementations, getters, and proxies during endpoint execution are caught and converted to typed
> failures where execution can safely continue.

Catastrophic runtime failures such as process termination or resource exhaustion are outside this
contract.

## Current explicit throw sites

All are in `src/core/createApi.ts`:

1. both `fetch` and `transport` passed to `createApiClient`;
2. `baseUrl` contains a query or fragment;
3. an endpoint path contains a query or fragment.

## API decision

- `createApiClient` returns `ApiClientFactory` directly;
- `factory.create` returns `ApiClient<T>` directly;
- `createApi` returns `ApiClient<T>` directly;
- passing both `fetch` and `transport` throws `ConflictingTransportOptionsError` at runtime;
- invalid configuration is reported immediately, never deferred until an endpoint call;
- endpoint methods continue returning typed `Result` values.

Constructor errors remain separate from `ApiError`, which represents endpoint execution failures.

## Implementation requirements

- Define discriminated `ClientConfigError` and `ApiDefinitionError` unions.
- Replace generic `TypeError` throws with typed constructor errors.
- Audit every platform/user-code boundary, including schema execution, property access, interceptors,
  custom transports, injected fetch, URL/header processing, JSON parsing, and URI encoding.
- Preserve the original thrown value as `cause: unknown` where it is useful for diagnostics.
- Keep throwing boundaries limited to constructor validation.
- Update every public example and type test for directly returned clients.

## Tests

- invalid `baseUrl` throws a typed constructor error;
- invalid endpoint path throws a typed constructor error;
- untyped JavaScript passing both `fetch` and `transport` throws a typed constructor error;
- throwing schema, interceptor, transport, fetch implementation, getter, and proxy do not leak a
  library-call exception where the boundary is recoverable;
- endpoint execution contains no explicit throw path;
- valid constructor behavior and endpoint inference remain direct and unchanged.

## Release impact

Constructor call sites remain ergonomic and unchanged. Initialization errors are now typed; endpoint
execution gains the no-throw guarantee. This task is first so later work uses the final error model.
