# TODO and open questions

Working notes for features that have a direction but are not fully designed. Milestone 1 is
complete; everything below belongs to a later milestone.

## 1. Request headers

Headers currently have no first-class configuration. `buildRequest` sets
`content-type: application/json` when an endpoint declares a body schema, but nothing else.
Applications can add headers through transport interceptors, although a simpler public API may
still be useful.

At least two configuration levels may be needed:

- client-level defaults shared by all requests, including lazy or asynchronous values for tokens;
- per-call headers for one-off values.

Open questions:

- merge order and precedence between client, endpoint, and call-level headers;
- whether names should be normalized before merging;
- whether callers may override the content type selected by body serialization;
- whether `EndpointDefinition` needs a header schema;
- where first-class header options should end and interceptors should begin.

## 2. Timeouts and cancellation

Calls already accept an `AbortSignal`. It passes through transport interceptors to `fetch`, and
cancellation returns a distinct `AbortError`.

The remaining design work includes:

- client-level timeouts with a per-call override;
- a distinct `TimeoutError`, separate from `AbortError` and `TransportError`;
- combining a caller-provided signal with the timeout signal.

## 3. Query serialization

Implemented. `serializeQuery` and the public client support `repeat`, `brackets`, and `comma` array
formats. A reusable client provides the default and an endpoint may override it:

```ts
const client = createApiClient({
    baseUrl: '/api',
    queryOptions: {
        arrayFormat: 'brackets',
    },
});

const definition = defineApi({
    search: {
        method: 'GET',
        path: '/search',
        query: SearchQuerySchema,
        queryOptions: {
            arrayFormat: 'comma',
        },
        response: SearchResponseSchema,
    },
});
```

Precedence is endpoint, then client, then the built-in `repeat` default. Callers cannot override
the format per request because the wire format is part of the configured HTTP contract.

`undefined` values and empty arrays are omitted, empty strings become `key=`, and input order is
preserved. In `comma` mode, commas inside values are encoded while separator commas are not.

## 4. Reusable clients and interceptors

Implemented. A reusable client owns the transport and shared configuration and creates APIs from
independent definitions:

```ts
const client = createApiClient({
    baseUrl: '/api',
    interceptors: [authInterceptor, loggingInterceptor],
});

const userApi = client.create(userApiDefinition);
const teamApi = client.create(teamApiDefinition);
```

Transport interceptors run after request validation and serialization but before `fetch`. They can
handle authentication, headers, correlation IDs, HTTP logging, metrics, and retry policies.

Possible later work:

- higher-level middleware that can inspect parsed `ApiError` values or typed results;
- explicit idempotency rules for retries;
- API-level or endpoint-level interceptors in addition to client interceptors.

## 5. File transfers and progress

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

## 6. Empty response bodies

Implemented. A successful empty response passes `undefined` to the response schema. The contract
must explicitly accept it with a schema such as `v.void()` or `v.undefined()`; an object schema
returns a `ResponseValidationError`.

Tests cover 204, 205, an empty 200 response, and response-schema validation. A 304 response remains
an `HttpError` because it is outside the 2xx success range.

## Deferred

- Continuous integration: `npm run check` currently runs only locally.
- Retries, authentication helpers, multipart bodies, streaming, optional path parameters,
  wildcards, and catch-all paths.
