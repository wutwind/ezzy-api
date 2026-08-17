# 001 — No-throw public API

Status: **design accepted; implement first**
Branch: `feat/no-throw`
Release request: [`../0.2.0.md`](../0.2.0.md)

## Goal

Library-authored failures must never escape through the public API as thrown exceptions. Expected
configuration, definition, validation, transport, parsing, and extension failures are returned as
typed `Result` failures.

The enforceable guarantee is:

> Library code contains no explicit throws. Exceptions raised by platform APIs or user-provided
> schemas, transports, interceptors, fetch implementations, getters, and proxies are caught at the
> boundary controlled by the library and converted to typed failures where execution can safely
> continue.

Catastrophic runtime failures such as process termination or resource exhaustion are outside this
contract.

## Current explicit throw sites

All are in `src/core/createApi.ts`:

1. both `fetch` and `transport` passed to `createApiClient`;
2. `baseUrl` contains a query or fragment;
3. an endpoint path contains a query or fragment.

## API decision

- `createApiClient` returns `Result<ApiClientFactory, ClientConfigError>`;
- `factory.create` returns `Result<ApiClient<T>, ApiDefinitionError>`;
- `createApi` returns the union of those constructor failure types;
- passing both `fetch` and `transport` returns `ConflictingTransportOptionsError` at runtime;
- invalid configuration is reported immediately, never deferred until an endpoint call;
- the library does not expose a throwing `unwrap` helper.

Constructor errors remain separate from `ApiError`, which represents endpoint execution failures.

## Implementation requirements

- Define discriminated `ClientConfigError` and `ApiDefinitionError` unions.
- Replace the three explicit throws with failures.
- Audit every platform/user-code boundary, including schema execution, property access, interceptors,
  custom transports, injected fetch, URL/header processing, JSON parsing, and URI encoding.
- Preserve the original thrown value as `cause: unknown` where it is useful for diagnostics.
- Add a lint or architecture check that rejects `ThrowStatement` under `src/`.
- Update every public example and type test for Result-returning constructors.

## Tests

- invalid `baseUrl` returns a typed failure;
- invalid endpoint path returns a typed failure;
- untyped JavaScript passing both `fetch` and `transport` returns a typed failure;
- throwing schema, interceptor, transport, fetch implementation, getter, and proxy do not leak a
  library-call exception where the boundary is recoverable;
- no explicit throw statement exists in shipped source;
- valid constructor behavior and endpoint inference remain unchanged after narrowing the Result.

## Release impact

This is a breaking change to every constructor call site and needs a dedicated migration example in
the changelog. It is first so all later 0.2.0 work is built on the final error model.
