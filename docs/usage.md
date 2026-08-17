# Using @wutwind/ezzy-api

This guide covers the public API of `@wutwind/ezzy-api`: declaring contracts, creating clients, making
requests, handling failures, configuring query serialization, adding transport interceptors,
cancelling calls, and supplying a custom transport.

## Requirements and installation

The current package targets Node.js 24 with Fetch and `AbortController`. It uses Standard Schema,
so the examples use Valibot, but another Standard Schema-compatible validator can be used instead.

```bash
npm install @wutwind/ezzy-api valibot @praha/byethrow
```

`@praha/byethrow` is shown as a direct dependency because application code normally imports its
`Result` helpers when consuming endpoint results.

## Mental model

An @wutwind/ezzy-api request passes through the following pipeline:

```text
typed call options
→ request schema validation and transformation
→ path/query/body serialization
→ transport interceptors (request side)
→ transport / fetch
→ transport interceptors (response side)
→ HTTP status and JSON parsing
→ response schema validation and transformation
→ Result<value, ApiError>
```

Schemas are the source of truth for both static types and runtime validation. Endpoint methods do
not throw for expected request, network, HTTP, or response-validation failures. They resolve to a
`Result` instead.

## 1. Define schemas and an API contract

```ts
import { defineApi } from '@wutwind/ezzy-api';
import * as v from 'valibot';

const UserSchema = v.object({
    id: v.string(),
    name: v.string(),
    email: v.pipe(v.string(), v.email()),
});

const UserParamsSchema = v.object({
    id: v.pipe(v.string(), v.uuid()),
});

const UsersQuerySchema = v.object({
    page: v.optional(v.number()),
    roles: v.optional(v.array(v.string())),
});

const CreateUserSchema = v.object({
    name: v.pipe(v.string(), v.minLength(2)),
    email: v.pipe(v.string(), v.email()),
});

export const userApiDefinition = defineApi({
    listUsers: {
        method: 'GET',
        path: '/users',
        query: UsersQuerySchema,
        response: v.array(UserSchema),
    },

    getUser: {
        method: 'GET',
        path: '/users/:id',
        params: UserParamsSchema,
        response: UserSchema,
    },

    createUser: {
        method: 'POST',
        path: '/users',
        body: CreateUserSchema,
        response: UserSchema,
    },

    deleteUser: {
        method: 'DELETE',
        path: '/users/:id',
        params: UserParamsSchema,
        response: v.undefined(),
    },
});
```

`defineApi()` is an identity function at runtime. Its purpose is to preserve endpoint and path
literals while applying compile-time contract checks.

### Endpoint fields

| Field          | Required      | Meaning                                                              |
| -------------- | ------------- | -------------------------------------------------------------------- |
| `method`       | yes           | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`        |
| `path`         | yes           | Relative endpoint path; `:name` segments declare path parameters     |
| `params`       | conditionally | Schema for path parameters; required when `path` contains parameters |
| `query`        | no            | Schema for query-string values                                       |
| `queryOptions` | no            | Endpoint-level query serialization override; requires `query`        |
| `body`         | no            | Schema for a JSON request body                                       |
| `response`     | yes           | Schema for the decoded successful response                           |

Do not include `?query` or `#fragment` in `path`. Query values belong in the `query` section.

### Path-parameter rules

For `/teams/:teamId/users/:userId`, the `params` schema must have exactly `teamId` and `userId`:

```ts
const ParamsSchema = v.object({
    teamId: v.string(),
    userId: v.string(),
});
```

Both the schema input and output must retain exactly those keys, and output values must be strings.
String-to-string validation or normalization is allowed; transforming a path value into a number
is rejected because the serializer requires strings.

Paths without `:parameters` must not declare a `params` schema.

## 2. Create and call a single API

Use `createApi()` for a standalone API:

```ts
import { createApi } from '@wutwind/ezzy-api';

export const userApi = createApi(userApiDefinition, {
    baseUrl: '/api',
});
```

The endpoint keys become typed asynchronous methods:

```ts
const listResult = await userApi.listUsers({
    query: {
        page: 1,
        roles: ['admin', 'editor'],
    },
});

const userResult = await userApi.getUser({
    params: {
        id: '550e8400-e29b-41d4-a716-446655440000',
    },
});

const createResult = await userApi.createUser({
    body: {
        name: 'Ada',
        email: 'ada@example.com',
    },
});
```

Keep path parameters, query values, and request body in separate sections. Pass
`{ params, query, body }`; do not merge their fields into one flat object. The library uses this
separation to place `params` in the URL path, `query` in the query string, and `body` in the JSON
request body.

### Required and optional call arguments

The schema input determines whether a section is required:

```ts
const OptionalQuery = v.object({
    page: v.optional(v.number()),
});

const RequiredQuery = v.object({
    search: v.string(),
    page: v.optional(v.number()),
});
```

An endpoint using `OptionalQuery` can be called in all of these ways:

```ts
await api.list();
await api.list({});
await api.list({ query: {} });
await api.list({ query: { page: 2 } });
```

An endpoint using `RequiredQuery` requires both the `query` section and its `search` field:

```ts
await api.search({
    query: {
        search: 'Ada',
    },
});

// TypeScript error: query.search is required.
await api.search({ query: {} });
```

Required `params` remain required even when `query` and `body` are optional. For example, given an
endpoint with the path `/users/:id`, required `params`, and optional update fields:

```ts
await api.updateUser({
    params: {
        id: '550e8400-e29b-41d4-a716-446655440000',
    },
});

await api.updateUser({
    params: {
        id: '550e8400-e29b-41d4-a716-446655440000',
    },
    query: {
        notify: true,
    },
    body: {
        name: 'Ada',
    },
});

// TypeScript error: params.id is required even when query and body are omitted.
await api.updateUser();
```

### Schema transformations

Request methods accept schema input, while the serialized request uses schema output. Successful
methods similarly return response-schema output:

```ts
const DateResponse = v.pipe(
    v.string(),
    v.transform((value) => new Date(value)),
);
```

An endpoint with `response: DateResponse` returns `Date` on success, not `string`.

## 3. Share configuration across several APIs

Create one reusable client in the application's composition root:

```ts
// api/client.ts
import { createApiClient } from '@wutwind/ezzy-api';

export const apiClient = createApiClient({
    baseUrl: '/api',
    queryOptions: {
        arrayFormat: 'brackets',
    },
    interceptors: [authInterceptor, unauthorizedInterceptor],
});
```

Bind separate definitions to it:

```ts
// api/userApi.ts
export const userApi = apiClient.create(userApiDefinition);

// api/teamApi.ts
export const teamApi = apiClient.create(teamApiDefinition);
```

Every bound API shares the same base URL, transport, query default, and interceptor chain. The
library does not create a global singleton; the application owns and explicitly shares the client.
This keeps tests, SSR, multi-tenant applications, and multiple backends isolated.

Create separate clients when different backends require different base URLs or credentials.

`createApi(definition, options)` is a shorthand for creating one client and immediately binding one
definition.

### Initialization errors

`createApiClient()`, `createApi()`, and `client.create()` return a usable client or API directly.
They do not return a `Result`. Invalid configuration and definitions are programmer or deployment
errors, so initialization fails immediately with a typed exception:

```ts
import { InvalidBaseUrlError, createApi } from '@wutwind/ezzy-api';

try {
    const api = createApi(userApiDefinition, { baseUrl: configuredBaseUrl });
    startApplication(api);
} catch (error) {
    if (error instanceof InvalidBaseUrlError) {
        console.error('Invalid API base URL:', error.baseUrl);
    }

    throw error;
}
```

The exported `ClientConfigError` union covers invalid client options, and `ApiDefinitionError`
covers invalid endpoint definitions. Catch these at the application's composition boundary only
when configuration is dynamic or you can provide a meaningful startup diagnostic. Once creation
succeeds, the API is guaranteed to be usable; endpoint methods return `Result` values for expected
runtime failures as described in section 7.

### Headers

Requests start with `accept: application/json`; requests with a body also start with
`content-type: application/json`.

| Layer       | Meaning                                           |
| ----------- | ------------------------------------------------- |
| Built-in    | JSON `accept`, conditional JSON `content-type`    |
| Client      | Headers shared by APIs created from the client    |
| Call        | Per-request values such as an authorization token |
| Interceptor | Final transport-level changes                     |

```ts
await userApi.getUser({
    params: { id: userId },
    headers: { authorization: `Bearer ${requestToken}` },
});
```

Names are normalized to lowercase. A later `undefined` value removes an earlier value. Only own,
enumerable entries in a header record are used; inherited entries are ignored and own value getters
are evaluated inside the guarded request-construction boundary. Accessor properties for the
top-level call options `headers` and `signal` are not invoked. Invalid names, NUL/CR/LF-containing
values, and throwing getters or proxies return a `RequestValidationError` for `headers`.
Browser-forbidden names are left to the Fetch runtime because availability differs by environment.

## 4. Configure query-array serialization

Supported formats are:

| Format     | Input                | Serialized query  |
| ---------- | -------------------- | ----------------- |
| `repeat`   | `{ tag: ['a','b'] }` | `tag=a&tag=b`     |
| `brackets` | `{ tag: ['a','b'] }` | `tag[]=a&tag[]=b` |
| `comma`    | `{ tag: ['a','b'] }` | `tag=a,b`         |

The built-in default is `repeat`. Configure a backend-wide convention once on the shared client.
For example, a Laravel/PHP application commonly uses bracketed arrays:

```ts
const apiClient = createApiClient({
    baseUrl: '/api',
    queryOptions: {
        arrayFormat: 'brackets',
    },
});
```

Override the format only for an exceptional endpoint:

```ts
const definition = defineApi({
    externalSearch: {
        method: 'GET',
        path: '/external-search',
        query: v.object({ tag: v.array(v.string()) }),
        queryOptions: {
            arrayFormat: 'comma',
        },
        response: v.array(v.string()),
    },
});
```

The effective priority is:

```text
endpoint queryOptions → client queryOptions → repeat
```

There is intentionally no call-level override: query serialization is part of the configured HTTP
contract, not a choice each caller should make.

Serialization details:

- strings, finite numbers, and booleans are supported;
- `undefined` values are omitted;
- empty arrays are omitted;
- array order and object-key order are preserved;
- an empty string is serialized as `key=`;
- in `comma` mode, commas inside values are percent-encoded while separator commas are not.

## 5. Add transport interceptors

An interceptor wraps a serialized `TransportRequest` and the raw `TransportResponse`:

```ts
import type { TransportInterceptor } from '@wutwind/ezzy-api';

const timingInterceptor: TransportInterceptor = async (request, next) => {
    const startedAt = performance.now();
    const result = await next(request);
    console.log(request.method, request.url, performance.now() - startedAt);
    return result;
};
```

For interceptors `[first, second]`, execution order is:

```text
first request
→ second request
  → transport
← second response
first response
```

### Add or replace headers

Transport objects are readonly. Pass a new request to `next`:

```ts
const authInterceptor: TransportInterceptor = (request, next) =>
    next({
        ...request,
        headers: {
            ...request.headers,
            authorization: `Bearer ${tokenStore.get()}`,
        },
    });
```

Reading the token inside the interceptor ensures that a refreshed token is used by later calls.

### React to a 401 response

Transport interceptors see the response before a non-2xx status becomes `HttpError`:

```ts
import { Result } from '@praha/byethrow';
import type { TransportInterceptor } from '@wutwind/ezzy-api';

const unauthorizedInterceptor: TransportInterceptor = async (request, next) => {
    const result = await next(request);

    if (Result.isSuccess(result) && result.value.status === 401) {
        router.navigate('/login');
    }

    return result;
};
```

Keep routing outside the library. Calling `window.location` inside @wutwind/ezzy-api would make the client
browser-specific and unsuitable for SSR. Applications with many concurrent `401` responses should
deduplicate navigation or token refresh inside their interceptor.

### Retry a request

An interceptor may call `next(request)` more than once:

```ts
const retryOnce: TransportInterceptor = async (request, next) => {
    const first = await next(request);

    if (Result.isSuccess(first) && first.value.status >= 500 && request.signal?.aborted !== true) {
        return next(request);
    }

    return first;
};
```

Retry policies should normally be limited to idempotent operations and must check cancellation.
The library intentionally does not apply an automatic retry policy.

If an interceptor throws or returns a rejected promise, the chain converts it to a
`TransportError`. Expected failures should still be represented as `Result` values.

## 6. Cancel a request

Every endpoint accepts `signal` as call metadata. It is not passed to any request schema:

```ts
const controller = new AbortController();

const pending = userApi.getUser({
    params: {
        id: '550e8400-e29b-41d4-a716-446655440000',
    },
    signal: controller.signal,
});

controller.abort('route changed');

const result = await pending;
```

An already-aborted request does not call Fetch. A request aborted during Fetch returns:

```ts
{
    type: 'AbortError',
    reason: signal.reason,
}
```

Interceptors must preserve `request.signal` when creating a replacement request. Retry
interceptors should stop when the signal is aborted.

Timeout configuration is not built in yet. Applications can pass `AbortSignal.timeout(ms)`, or use
`AbortSignal.any()` when a timeout and caller-controlled cancellation must be combined.

## 7. Handle results and errors

```ts
import { Result } from '@praha/byethrow';

const result = await userApi.getUser({
    params: { id },
});

if (Result.isSuccess(result)) {
    console.log(result.value.name);
} else {
    handleApiError(result.error);
}
```

`ApiError` is a closed discriminated union:

| `error.type`              | Meaning                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `RequestValidationError`  | Input validation or request serialization failed                 |
| `AbortError`              | The call's `AbortSignal` was aborted                             |
| `TransportError`          | Fetch, response reading, custom transport, or interceptor failed |
| `HttpError`               | The server returned a non-2xx status                             |
| `ResponseValidationError` | Successful response JSON or schema validation failed             |

A complete handler can narrow every variant:

```ts
import type { ApiError } from '@wutwind/ezzy-api';

function handleApiError(error: ApiError): void {
    switch (error.type) {
        case 'RequestValidationError':
            console.error(error.section, error.issues, error.cause);
            break;

        case 'AbortError':
            console.info('Request cancelled', error.reason);
            break;

        case 'TransportError':
            console.error('Network or transport failure', error.cause);
            break;

        case 'HttpError':
            console.error(error.status, error.statusText, error.body);
            break;

        case 'ResponseValidationError':
            if (error.reason === 'SchemaValidation') {
                console.error('Invalid server response', error.issues);
            } else {
                console.error(error.reason, error.cause);
            }
            break;
    }
}
```

Request validation errors include `section: 'params' | 'query' | 'body' | 'headers'`. Response
validation reasons are:

- `InvalidJson` — a successful non-empty response was not valid JSON;
- `SchemaValidation` — decoded JSON did not satisfy the response schema;
- `SchemaError` — the response validator itself threw or rejected.

HTTP error bodies remain raw strings. Non-2xx responses are not decoded or checked against the
success response schema.

## 8. Handle empty successful responses

Successful responses with an empty body are passed to the response schema as `undefined`. Declare
that explicitly for `204`, `205`, `HEAD`, or endpoints that return an empty `200`:

```ts
deleteUser: {
    method: 'DELETE',
    path: '/users/:id',
    params: UserParamsSchema,
    response: v.undefined(),
}
```

If the response schema requires an object, an empty successful response becomes a
`ResponseValidationError` with reason `SchemaValidation`. The schema is never bypassed.

## 9. Inject Fetch for tests

Use the `fetch` option for deterministic tests:

```ts
const api = createApi(userApiDefinition, {
    baseUrl: 'https://example.test',
    fetch: (url, init) => {
        assert.equal(url, 'https://example.test/users/1');
        assert.equal(init.method, 'GET');
        return Promise.resolve(new Response('{"id":"1","name":"Test","email":"test@example.com"}'));
    },
});
```

The injected function receives the final serialized URL and `RequestInit`, including the
`AbortSignal` when provided.

## 10. Supply a custom transport

Use a custom transport when Fetch is insufficient, for example for browser upload progress through
`XMLHttpRequest`:

```ts
import { Result } from '@praha/byethrow';
import { createApiClient, type Transport, type TransportFailure } from '@wutwind/ezzy-api';

const transport: Transport<TransportFailure> = {
    request: async (request) => {
        try {
            // Send request using the desired runtime or HTTP library.
            return Result.succeed({
                status: 200,
                statusText: 'OK',
                headers: {},
                body: '{}',
            });
        } catch (cause) {
            return Result.fail({ type: 'TransportError', cause });
        }
    },
};

const client = createApiClient({
    baseUrl: '/api',
    transport,
});
```

Pass either `fetch` or `transport`, never both. Interceptors wrap a custom transport in exactly the
same way as the built-in Fetch transport.

The current `TransportRequest.body` and `TransportResponse.body` are strings. Multipart bodies,
binary responses, streaming, and transfer-progress callbacks are intentionally not part of the
current public runtime contract yet.

## 11. URL and JSON behavior

- `baseUrl` may be absolute (`https://api.example.com`) or relative (`/api`).
- A trailing slash on `baseUrl` and a leading slash on `path` are normalized at their boundary.
- `baseUrl` and endpoint paths must not contain a query string or fragment.
- Path values are encoded with `encodeURIComponent`.
- Query keys and values are percent-encoded.
- Declared request bodies are serialized with `JSON.stringify`.
- A JSON body adds `content-type: application/json`.
- Every non-empty successful response is parsed as JSON before schema validation.
- Every non-2xx status becomes `HttpError`, including redirects returned to the transport.

## 12. Current limitations

The current version does not provide first-class configuration for:

- timeouts;
- built-in retry or authentication policies;
- multipart and binary request bodies;
- upload/download progress;
- streaming responses;
- optional path parameters, wildcards, or catch-all paths.

These boundaries are tracked in [`todo.md`](./todo.md). They should not be inferred from internal
helpers that are not exported by the package.
