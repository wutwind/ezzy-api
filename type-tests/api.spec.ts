import * as v from 'valibot';

import { createApi, defineApi, type ApiClient } from '../src/index.ts';

const OkSchema = v.object({
    ok: v.boolean(),
});

const ItemSchema = v.object({
    id: v.string(),
});

const IdParamsSchema = v.object({
    id: v.string(),
});

const OptionalQuerySchema = v.object({
    page: v.optional(v.number()),
});

const RequiredQuerySchema = v.object({
    search: v.string(),
    page: v.optional(v.number()),
});

const OptionalBodySchema = v.object({
    name: v.optional(v.string()),
});

const LessonParamsSchema = v.object({
    courseId: v.string(),
    lessonId: v.string(),
});

const TransformBodySchema = v.object({
    amount: v.pipe(
        v.string(),
        v.transform((value) => Number(value)),
    ),
});

const DateResponseSchema = v.pipe(
    v.string(),
    v.transform((value) => new Date(value)),
);

const definition = defineApi({
    ping: {
        method: 'GET',
        path: '/ping',
        response: OkSchema,
    },
    list: {
        method: 'GET',
        path: '/items',
        query: OptionalQuerySchema,
        response: v.array(ItemSchema),
    },
    search: {
        method: 'GET',
        path: '/search',
        query: RequiredQuerySchema,
        response: v.array(ItemSchema),
    },
    patchCourse: {
        method: 'PATCH',
        path: '/courses/:id',
        params: IdParamsSchema,
        body: OptionalBodySchema,
        response: ItemSchema,
    },
    getLesson: {
        method: 'GET',
        path: '/courses/:courseId/lessons/:lessonId',
        params: LessonParamsSchema,
        response: ItemSchema,
    },
    transform: {
        method: 'POST',
        path: '/transform',
        body: TransformBodySchema,
        response: DateResponseSchema,
    },
});

declare const api: ApiClient<typeof definition>;

// Case A: endpoint without input.
api.ping();
api.ping({});
api.ping({ signal: new AbortController().signal });
api.ping({ headers: { authorization: 'Bearer token', accept: undefined } });

// @ts-expect-error header values must be strings or undefined
api.ping({ headers: { authorization: 42 } });

// Case B: fully optional query.
api.list();
api.list({});
api.list({ query: {} });
api.list({ query: { page: 1 } });

// Case C: required query.
// @ts-expect-error query is required
api.search();

api.search({
    query: {
        search: 'type safety',
    },
});

api.search({
    // @ts-expect-error search is required
    query: {},
});

// Case D: optional body with required params.
api.patchCourse({
    params: {
        id: 'course-1',
    },
});

api.patchCourse({
    params: {
        id: 'course-1',
    },
    body: {},
});

// @ts-expect-error params remain required when body is optional
api.patchCourse();

// Case E: multiple path params.
api.getLesson({
    params: {
        courseId: 'course-1',
        lessonId: 'lesson-1',
    },
});

api.getLesson({
    // @ts-expect-error lessonId is required
    params: {
        courseId: 'course-1',
    },
});

// Case F: path/schema consistency.
const MissingParamSchema = v.object({});
const RenamedParamSchema = v.object({
    courseId: v.string(),
});
const ExtraParamSchema = v.object({
    id: v.string(),
    extra: v.string(),
});
const NumberParamSchema = v.object({ id: v.number() });
const NumberOutputParamSchema = v.object({
    id: v.pipe(
        v.string(),
        v.transform((value) => Number(value)),
    ),
});

defineApi({
    // @ts-expect-error params schema is required for a path with params
    missingSchema: {
        method: 'GET',
        path: '/courses/:id',
        response: ItemSchema,
    },
});

defineApi({
    // @ts-expect-error queryOptions require a query schema
    optionsWithoutQuery: {
        method: 'GET',
        path: '/courses',
        queryOptions: { arrayFormat: 'comma' },
        response: ItemSchema,
    },
});

defineApi({
    // @ts-expect-error path parameter input must use strings
    numberInput: {
        method: 'GET',
        path: '/courses/:id',
        params: NumberParamSchema,
        response: ItemSchema,
    },
});

defineApi({
    // @ts-expect-error path parameter schema output must remain a string
    numberOutput: {
        method: 'GET',
        path: '/courses/:id',
        params: NumberOutputParamSchema,
        response: ItemSchema,
    },
});

defineApi({
    // @ts-expect-error params schema is missing the id key
    missingKey: {
        method: 'GET',
        path: '/courses/:id',
        params: MissingParamSchema,
        response: ItemSchema,
    },
});

defineApi({
    // @ts-expect-error params schema key must match the path
    renamedKey: {
        method: 'GET',
        path: '/courses/:id',
        params: RenamedParamSchema,
        response: ItemSchema,
    },
});

defineApi({
    // @ts-expect-error params schema must not contain extra keys
    extraKey: {
        method: 'GET',
        path: '/courses/:id',
        params: ExtraParamSchema,
        response: ItemSchema,
    },
});

defineApi({
    // @ts-expect-error params schema is forbidden for a path without params
    unexpectedSchema: {
        method: 'GET',
        path: '/courses',
        params: IdParamsSchema,
        response: ItemSchema,
    },
});

// Case G: createApi validates inline definitions and returns an API directly.
const created = createApi(
    { ping: { method: 'GET', path: '/ping', response: OkSchema } },
    { baseUrl: '/api' },
);
created.ping();

createApi(
    {
        // @ts-expect-error params schema is required for a path with params
        missingSchema: {
            method: 'GET',
            path: '/courses/:id',
            response: ItemSchema,
        },
    },
    { baseUrl: '/api' },
);

createApi(
    {
        // @ts-expect-error params schema is forbidden for a path without params
        unexpectedSchema: {
            method: 'GET',
            path: '/courses',
            params: IdParamsSchema,
            response: ItemSchema,
        },
    },
    { baseUrl: '/api' },
);

// Case H: request uses schema input and response uses schema output.
api.transform({
    body: {
        amount: '42',
    },
});

api.transform({
    body: {
        // @ts-expect-error transformed request input is string, not number
        amount: 42,
    },
});

const transformed = await api.transform({
    body: {
        amount: '42',
    },
});

if (transformed.type === 'Success') {
    transformed.value satisfies Date;
    // @ts-expect-error response uses schema output, not schema input
    transformed.value satisfies string;
}
