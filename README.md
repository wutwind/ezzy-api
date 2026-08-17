# @wutwind/ezzy-api

A TypeScript library for declaring HTTP API contracts from runtime schemas and creating a
type-safe fetch client from those contracts.

The schema is the single source of truth for request and response types. The core uses Standard
Schema, so compatible validators such as Valibot can provide runtime validation and type inference.

For a complete application-oriented guide, see [Using @wutwind/ezzy-api](docs/usage.md).

## Installation

```bash
npm install @wutwind/ezzy-api valibot @praha/byethrow
```

The current package requires Node.js 24. Valibot may be replaced with another Standard
Schema-compatible validator.

## Repository setup

The recommended development environment is Docker Compose through the repository Makefile.
Install the locked dependencies and run the complete project check from any terminal:

```bash
make setup
make check
```

The Makefile forwards the current user and user ID to the container. Other available commands are
listed by `make help`. To open an interactive shell in the same environment, run:

```bash
make run
```

The underlying Docker Compose commands remain available directly when needed.

To work without Docker, use Node.js 24 and install the locked dependencies:

```bash
npm ci
npm run check
```

The check runs TypeScript, type-aware linting, formatting validation, and runtime tests. TypeScript
also verifies the public example and colocated type specs with intentional failures marked by
`@ts-expect-error`.

## Define an API

Create runtime schemas and pass the endpoint map to `defineApi()`:

```ts
import * as v from 'valibot';
import { defineApi } from '@wutwind/ezzy-api';

const CourseSchema = v.object({
    id: v.string(),
    name: v.string(),
});

const CourseParamsSchema = v.object({
    id: v.pipe(v.string(), v.uuid()),
});

const CreateCourseSchema = v.object({
    name: v.pipe(v.string(), v.minLength(3), v.maxLength(360)),
});

const apiDefinition = defineApi({
    getCourse: {
        method: 'GET',
        path: '/courses/:id',
        params: CourseParamsSchema,
        response: CourseSchema,
    },
    createCourse: {
        method: 'POST',
        path: '/courses',
        body: CreateCourseSchema,
        response: CourseSchema,
    },
});
```

Endpoint fields:

| Field      | Required | Description                                                   |
| ---------- | -------- | ------------------------------------------------------------- |
| `method`   | yes      | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS` |
| `path`     | yes      | URL path; `:name` segments declare path parameters            |
| `params`   | no       | Schema for path parameters                                    |
| `query`    | no       | Schema for query parameters                                   |
| `body`     | no       | Schema for the request body                                   |
| `response` | yes      | Schema whose output becomes the endpoint result type          |

`defineApi()` preserves endpoint names and path literals while validating the definition at
compile time. It is an identity function at runtime and does not create a transport.

`createApi()` applies the same compile-time validation, so a definition written inline cannot skip
these checks.

## Runtime client

`createApi()` maps every endpoint to a typed method and uses fetch at runtime:

```ts
import { Result } from '@praha/byethrow';
import { createApi } from '@wutwind/ezzy-api';

const api = createApi(apiDefinition, {
    baseUrl: '/api',
});

const result = await api.getCourse({
    params: {
        id: '550e8400-e29b-41d4-a716-446655440000',
    },
});

if (Result.isFailure(result)) {
    console.error(result.error);
} else {
    console.log(result.value.name);
}
```

Pass an `AbortSignal` to cancel an individual call. Cancellation is returned as a typed
`AbortError` failure:

```ts
const controller = new AbortController();
const resultPromise = api.getCourse({
    params: { id: '550e8400-e29b-41d4-a716-446655440000' },
    signal: controller.signal,
});

controller.abort();
const result = await resultPromise;
```

The success value is inferred from `CourseSchema` as `{ id: string; name: string }`. Expected
failures are returned as a typed `ApiError` instead of being thrown.

## Request typing rules

- Request data is grouped into `params`, `query`, and `body`; fields are not flattened.
- A schema with required properties makes its request section required.
- A schema whose properties are all optional makes its request section optional.
- An endpoint with no required request sections can be called without an argument.
- Path parameters are extracted from `:name` segments.
- A `params` schema is required for paths with parameters and must exactly match their names.
- A `params` schema is rejected when the path has no parameters.
- Every endpoint must declare a response schema.

An optional query may be omitted:

```ts
const coursesResult = await api.getCourses();
const nextPageResult = await api.getCourses({ query: { page: 2 } });
```

A body schema with a required `name` makes the body required:

```ts
const createdResult = await api.createCourse({
    body: { name: 'TypeScript' },
});
```

## Shared client, query format, and interceptors

Use `createApiClient()` when several API definitions share transport configuration. Query array
format defaults and transport interceptors apply to every API created by that client:

```ts
const client = createApiClient({
    baseUrl: '/api',
    queryOptions: { arrayFormat: 'brackets' },
    interceptors: [authInterceptor],
});

const userApi = client.create(userApiDefinition);
const teamApi = client.create(teamApiDefinition);
```

An endpoint can override the shared query array format with `queryOptions`. Supported formats are
`repeat`, `brackets`, and `comma`; the built-in default is `repeat`.

Transport interceptors wrap the serialized request and raw HTTP response. Request handlers run in
declaration order and response handlers run in reverse order. They can add headers, observe status
codes such as `401`, and invoke `next` again for retry policies. Application-specific side effects,
such as navigating to a login page, belong in an interceptor supplied by the application.

`createApi(definition, options)` remains the shorthand for creating a single API without retaining
a reusable client.

## Public API

The package exposes three runtime functions:

- `defineApi()` declares and type-checks an endpoint contract;
- `createApi()` creates the runtime client.
- `createApiClient()` creates reusable transport configuration for multiple API definitions.

It also exposes the supporting API, query, call-option, transport, and interceptor types required
to configure clients and custom transports. Path building, query serialization, and schema
validation functions remain internal details of the client pipeline.

## Project files

- `src/core/types.ts` contains the type-level API model.
- `src/core/defineApi.ts` contains the API definition helper.
- `src/path/buildPath.ts` contains URL path interpolation.
- `src/query/serializeQuery.ts` contains query string serialization.
- `*.runtime.spec.ts` files contain colocated Node tests.
- `*.types.spec.ts` files contain colocated compile-time tests.
- `src/index.ts` is the public entry point.
- `examples/basic.ts` demonstrates valid usage and response inference.
- `docs/todo.md` records open design questions for the next milestone.
- `docs/releasing.md` defines the versioning, tagging, and npm publication process.

## Current limitations

The current client supports fetch with JSON request and response bodies, cancellation, and
transport interceptors. It does not yet include first-class request-header configuration, timeouts,
retry or authentication policies, multipart bodies, transfer progress, streaming, optional path
parameters, wildcards, or catch-all paths. Empty successful responses are passed to the response
schema as `undefined`, so the contract must explicitly accept them.

Open design questions for these are tracked in `docs/todo.md`.
