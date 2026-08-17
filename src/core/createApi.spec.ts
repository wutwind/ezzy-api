import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';
import * as v from 'valibot';

import { ApiDefinitionExecutionError, InvalidEndpointPathError } from '../errors/apiDefinitionError.ts';
import {
    ClientConfigExecutionError,
    ConflictingTransportOptionsError,
    InvalidBaseUrlError,
    InvalidClientOptionError,
} from '../errors/clientConfigError.ts';
import { createApi, createApiClient } from './createApi.ts';
import { defineApi } from './defineApi.ts';

const CourseSchema = v.object({ id: v.string(), name: v.string() });

describe('createApi', () => {
    it('creates own methods for prototype-sensitive endpoint names', () => {
        const definition = Object.create(null) as Record<string, unknown>;
        definition.__proto__ = {
            method: 'GET',
            path: '/prototype',
            response: v.unknown(),
        };
        definition['constructor'] = {
            method: 'GET',
            path: '/constructor',
            response: v.unknown(),
        };

        // The null-prototype definition simulates valid JavaScript input with arbitrary keys.
        const api = createApi(definition as never, { baseUrl: '/api' }) as Record<string, unknown>;

        assert.equal(Object.hasOwn(api, '__proto__'), true);
        assert.equal(Object.hasOwn(api, 'constructor'), true);
        assert.equal(typeof api.__proto__, 'function');
        assert.equal(typeof api['constructor'], 'function');
    });

    it('generates endpoint methods and executes the complete happy path', async () => {
        let receivedUrl: string | undefined;
        let receivedInit: RequestInit | undefined;
        const definition = defineApi({
            createCourse: {
                method: 'POST',
                path: '/courses/:id',
                params: v.object({ id: v.string() }),
                query: v.object({ publish: v.boolean() }),
                body: v.object({ name: v.string() }),
                response: CourseSchema,
            },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            fetch: (url, init) => {
                receivedUrl = url;
                receivedInit = init;
                return Promise.resolve(
                    new Response('{"id":"course-1","name":"TypeScript"}', { status: 200 }),
                );
            },
        });

        const result = await api.createCourse({
            params: { id: 'course/1' },
            query: { publish: true },
            body: { name: 'TypeScript' },
        });

        assert.equal(receivedUrl, '/api/courses/course%2F1?publish=true');
        assert.equal(receivedInit?.method, 'POST');
        assert.deepEqual(receivedInit?.headers, {
            accept: 'application/json',
            'content-type': 'application/json',
        });
        assert.equal(receivedInit?.body, '{"name":"TypeScript"}');
        assert.deepEqual(Result.unwrap(result), { id: 'course-1', name: 'TypeScript' });
    });

    it('does not call fetch when request validation fails', async () => {
        let fetchCalls = 0;
        const definition = defineApi({
            createCourse: {
                method: 'POST',
                path: '/courses',
                body: v.object({ name: v.string() }),
                response: CourseSchema,
            },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            fetch: () => {
                fetchCalls += 1;
                return Promise.resolve(new Response('{}'));
            },
        });

        // Runtime guard for untyped JavaScript callers.
        const result = await api.createCourse({ body: { name: 42 } } as never);

        assert.equal(fetchCalls, 0);
        assert.equal(Result.unwrapError(result).type, 'RequestValidationError');
    });

    it('returns response schema output after transforms', async () => {
        const definition = defineApi({
            serverTime: {
                method: 'GET',
                path: '/time',
                response: v.pipe(
                    v.string(),
                    v.transform((value) => new Date(value)),
                ),
            },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            fetch: () => Promise.resolve(new Response('"2026-08-14T00:00:00.000Z"')),
        });

        const result = await api.serverTime();

        assert.deepEqual(Result.unwrap(result), new Date('2026-08-14T00:00:00.000Z'));
    });

    it('validates an empty successful response as undefined', async () => {
        const definition = defineApi({
            removeCourse: {
                method: 'DELETE',
                path: '/courses/1',
                response: v.undefined(),
            },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            fetch: () => Promise.resolve(new Response(null, { status: 204 })),
        });

        assert.equal(Result.unwrap(await api.removeCourse()), undefined);
    });

    it('rejects an empty response when the response schema requires an object', async () => {
        const definition = defineApi({
            getCourse: { method: 'GET', path: '/course', response: CourseSchema },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            fetch: () => Promise.resolve(new Response(null, { status: 204 })),
        });

        const result = await api.getCourse();
        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result) && result.error.type === 'ResponseValidationError') {
            assert.equal(result.error.reason, 'SchemaValidation');
        }
    });

    it('supports calls with an omitted optional query', async () => {
        let receivedUrl: string | undefined;
        const definition = defineApi({
            listCourses: {
                method: 'GET',
                path: '/courses',
                query: v.object({ page: v.optional(v.number()) }),
                response: v.array(CourseSchema),
            },
        });
        const api = createApi(definition, {
            baseUrl: '/api/',
            fetch: (url) => {
                receivedUrl = url;
                return Promise.resolve(new Response('[]'));
            },
        });

        const result = await api.listCourses();

        assert.equal(receivedUrl, '/api/courses');
        assert.deepEqual(Result.unwrap(result), []);
    });

    it('shares defaults and response interceptors across API definitions', async () => {
        const receivedUrls: string[] = [];
        const unauthorizedStatuses: number[] = [];
        const client = createApiClient({
            baseUrl: '/api',
            queryOptions: { arrayFormat: 'brackets' },
            interceptors: [
                async (request, next) => {
                    const result = await next(request);
                    if (Result.isSuccess(result) && result.value.status === 401) {
                        unauthorizedStatuses.push(result.value.status);
                    }
                    return result;
                },
            ],
            fetch: (url) => {
                receivedUrls.push(url);
                return Promise.resolve(
                    url.includes('unauthorized') ? new Response('', { status: 401 }) : new Response('[]'),
                );
            },
        });
        const listDefinition = defineApi({
            list: {
                method: 'GET',
                path: '/items',
                query: v.object({ tag: v.array(v.string()) }),
                response: v.array(v.string()),
            },
        });
        const authDefinition = defineApi({
            unauthorized: { method: 'GET', path: '/unauthorized', response: v.unknown() },
        });

        await client.create(listDefinition).list({ query: { tag: ['a', 'b'] } });
        await client.create(authDefinition).unauthorized();

        assert.deepEqual(receivedUrls, ['/api/items?tag[]=a&tag[]=b', '/api/unauthorized']);
        assert.deepEqual(unauthorizedStatuses, [401]);
    });

    it('lets an endpoint override the client query array format', async () => {
        let receivedUrl: string | undefined;
        const definition = defineApi({
            list: {
                method: 'GET',
                path: '/items',
                query: v.object({ tag: v.array(v.string()) }),
                queryOptions: { arrayFormat: 'comma' },
                response: v.array(v.string()),
            },
        });
        const api = createApiClient({
            baseUrl: '/api',
            queryOptions: { arrayFormat: 'brackets' },
            fetch: (url) => {
                receivedUrl = url;
                return Promise.resolve(new Response('[]'));
            },
        }).create(definition);

        await api.list({ query: { tag: ['a', 'b'] } });

        assert.equal(receivedUrl, '/api/items?tag=a,b');
    });

    it('merges client and per-call headers before interceptors', async () => {
        let observedHeaders: Readonly<Record<string, string>> | undefined;
        const api = createApi(defineApi({ ping: { method: 'GET', path: '/ping', response: v.unknown() } }), {
            baseUrl: '/api',
            headers: { Authorization: 'client-token', 'X-Client': 'client' },
            interceptors: [
                async (request, next) => {
                    observedHeaders = request.headers;
                    return await next({
                        ...request,
                        headers: { ...request.headers, 'x-interceptor': 'yes' },
                    });
                },
            ],
            fetch: () => Promise.resolve(new Response('{}')),
        });

        await api.ping({
            headers: { authorization: 'call-token', 'x-client': undefined, 'X-Call': 'call' },
        });

        assert.deepEqual(observedHeaders, {
            accept: 'application/json',
            authorization: 'call-token',
            'x-call': 'call',
        });
    });

    it('returns AbortError without calling fetch for an already aborted request', async () => {
        let fetchCalls = 0;
        const controller = new AbortController();
        controller.abort('navigation');
        const api = createApi(defineApi({ ping: { method: 'GET', path: '/ping', response: v.unknown() } }), {
            baseUrl: '/api',
            fetch: () => {
                fetchCalls += 1;
                return Promise.resolve(new Response('{}'));
            },
        });

        const result = await api.ping({ signal: controller.signal });

        assert.equal(fetchCalls, 0);
        assert.deepEqual(Result.unwrapError(result), { type: 'AbortError', reason: 'navigation' });
    });

    it('rejects ambiguous URL configuration when creating a client or API', () => {
        assert.throws(
            () => createApiClient({ baseUrl: '/api?tenant=1' }),
            (error) => error instanceof InvalidBaseUrlError && error.baseUrl === '/api?tenant=1',
        );
        assert.throws(
            () =>
                createApi(
                    // Runtime guard for JavaScript callers.
                    { invalid: { method: 'GET', path: '/items?all=1', response: v.unknown() } },
                    { baseUrl: '/api' },
                ),
            (error) =>
                error instanceof InvalidEndpointPathError &&
                error.endpoint === 'invalid' &&
                error.path === '/items?all=1',
        );
    });

    it('throws a typed error when JavaScript passes fetch and transport together', () => {
        assert.throws(
            () =>
                createApiClient({
                    baseUrl: '/api',
                    fetch: globalThis.fetch,
                    transport: { request: () => Promise.resolve(Result.fail({ type: 'TransportError' })) },
                } as never),
            ConflictingTransportOptionsError,
        );
    });

    it('validates client options during initialization', () => {
        assert.throws(
            () => createApiClient({ baseUrl: '/api', headers: { 'bad name': 'value' } }),
            (error) => error instanceof InvalidClientOptionError && error.option === 'headers',
        );
        assert.throws(
            () => createApiClient({ baseUrl: '/api', fetch: 42 } as never),
            (error) => error instanceof InvalidClientOptionError && error.option === 'fetch',
        );
        assert.throws(
            () => createApiClient({ baseUrl: '/api', interceptors: [null] } as never),
            (error) => error instanceof InvalidClientOptionError && error.option === 'interceptors',
        );
    });

    it('converts throwing configuration and definition proxies to constructor failures', () => {
        const configCause = new Error('config proxy');
        const config = new Proxy(
            {},
            {
                get() {
                    throw configCause;
                },
            },
        );
        const definitionCause = new Error('definition proxy');
        const definition = new Proxy(
            {},
            {
                ownKeys() {
                    throw definitionCause;
                },
            },
        );

        assert.throws(
            () => createApiClient(config as never),
            (error) => error instanceof ClientConfigExecutionError && error.cause === configCause,
        );

        const client = createApiClient({ baseUrl: '/api' });
        assert.throws(
            () => client.create(definition as never),
            (error) => error instanceof ApiDefinitionExecutionError && error.cause === definitionCause,
        );
    });

    it('converts a throwing call-options getter to an endpoint failure', async () => {
        const cause = new Error('signal getter');
        const api = createApi(defineApi({ ping: { method: 'GET', path: '/ping', response: v.unknown() } }), {
            baseUrl: '/api',
        });
        const options = new Proxy(
            {},
            {
                getOwnPropertyDescriptor() {
                    throw cause;
                },
            },
        );

        assert.deepEqual(Result.unwrapError(await api.ping(options)), {
            type: 'TransportError',
            cause,
        });
    });

    it('returns TransportError from the public endpoint method', async () => {
        const cause = new Error('offline');
        const definition = defineApi({
            ping: { method: 'GET', path: '/ping', response: v.object({ ok: v.boolean() }) },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            fetch: () => Promise.reject(cause),
        });

        const result = await api.ping();

        assert.deepEqual(Result.unwrapError(result), { type: 'TransportError', cause });
    });

    it('returns HttpError with status details and response body', async () => {
        const definition = defineApi({
            getCourse: { method: 'GET', path: '/course', response: CourseSchema },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            fetch: () =>
                Promise.resolve(
                    new Response('{"message":"missing"}', {
                        status: 404,
                        statusText: 'Not Found',
                    }),
                ),
        });

        const result = await api.getCourse();

        assert.deepEqual(Result.unwrapError(result), {
            type: 'HttpError',
            status: 404,
            statusText: 'Not Found',
            body: '{"message":"missing"}',
        });
    });

    it('returns ResponseValidationError for malformed JSON', async () => {
        const definition = defineApi({
            getCourse: { method: 'GET', path: '/course', response: CourseSchema },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            fetch: () => Promise.resolve(new Response('{invalid')),
        });

        const result = await api.getCourse();

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
            assert.equal(result.error.type, 'ResponseValidationError');
            if (result.error.type === 'ResponseValidationError') {
                assert.equal(result.error.reason, 'InvalidJson');
            }
        }
    });

    it('returns ResponseValidationError when the server violates the schema', async () => {
        const definition = defineApi({
            getCourse: { method: 'GET', path: '/course', response: CourseSchema },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            fetch: () => Promise.resolve(new Response('{"id":1,"name":"TypeScript"}')),
        });

        const result = await api.getCourse();

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
            assert.equal(result.error.type, 'ResponseValidationError');
            if (result.error.type === 'ResponseValidationError') {
                assert.equal(result.error.reason, 'SchemaValidation');
            }
            if (
                result.error.type === 'ResponseValidationError' &&
                result.error.reason === 'SchemaValidation'
            ) {
                assert.ok(result.error.issues.length > 0);
            }
        }
    });
});
