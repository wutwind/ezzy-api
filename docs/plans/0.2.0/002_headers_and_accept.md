# 002 — Client/call headers and JSON Accept

Status: **ready after 001**
Branch: `feat/headers`
Depends on: 001
Release request: [`../0.2.0.md`](../0.2.0.md)

## Goal

Allow a reusable module-level client to receive a different authorization token on every call, and
send `accept: application/json` by default for the library's JSON-only protocol.

Without call-level headers, a stateless consumer must create a new client and interceptor for each
incoming request merely to capture its user token. Without the Accept default, Laravel may return an
HTML page for 401 or 422 responses even though this library otherwise promises a JSON protocol.

## Public API

Add `headers` to `CreateApiClientOptions` and `CallOptions`:

```ts
type HeaderOptions = Readonly<Record<string, string | undefined>>;
```

Precedence is `built-in defaults < client < call < interceptor`. Header names are normalized to
lowercase before merging. `undefined` removes a value inherited from an earlier layer.

Built-in behavior:

- `accept: application/json` is always the initial default;
- `content-type: application/json` is added only when a body exists;
- both defaults can be replaced or removed explicitly;
- `TransportRequest.headers` contains only resolved string values.

## Validation

Invalid names or values must become a typed request-construction failure under the no-throw model.
Before implementation, define validation in terms of Fetch/WHATWG-compatible header syntax and
document whether browser-forbidden header names are rejected or left to the runtime.

Call-option reading must share one safe mechanism with `signal` and future `timeoutMs` handling.
Inherited properties and getters must have explicitly tested behavior.

## Tests

- call overrides client regardless of case;
- normalization does not produce duplicates;
- call `undefined` removes a client/default header;
- body-derived content type is absent without a body and overridable with a body;
- default Accept is present and can be replaced or removed;
- interceptor observes the final merged set;
- invalid header input returns a typed failure and never throws.

## Documentation

Add the precedence table and a per-request auth-token example. Note the externally visible behavior
change caused by the new Accept default.
