import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';
import * as v from 'valibot';

import {
    ApiDefinitionExecutionError,
    InvalidEndpointDefinitionError,
    InvalidEndpointPathError,
} from '../errors/apiDefinitionError.ts';
import {
    ClientConfigExecutionError,
    ConflictingTransportOptionsError,
    InvalidBaseUrlError,
    InvalidClientOptionError,
} from '../errors/clientConfigError.ts';
import type { TransportFailure } from '../transport/interceptors.ts';
import type { Transport, TransportRequest } from '../transport/types.ts';
import { multipartBody, multipartStreamBody, streamBody } from './bodyKinds.ts';
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

    it('uploads a multipart body without a JSON content type', async () => {
        let receivedInit: RequestInit | undefined;
        const definition = defineApi({
            uploadAvatar: {
                method: 'POST',
                path: '/users/:id/avatar',
                params: v.object({ id: v.string() }),
                body: multipartBody(),
                response: CourseSchema,
            },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            headers: { 'content-type': 'application/json' },
            fetch: (_url, init) => {
                receivedInit = init;
                return Promise.resolve(new Response('{"id":"user-1","name":"avatar"}'));
            },
        });

        const result = await api.uploadAvatar({
            params: { id: 'user-1' },
            body: { file: new Blob(['bytes']), title: 'avatar' },
            headers: { 'content-type': 'multipart/form-data; boundary=x' },
        });

        assert.deepEqual(Result.unwrap(result), { id: 'user-1', name: 'avatar' });
        const body = receivedInit?.body;
        assert.ok(body instanceof FormData);
        assert.equal(body.get('title'), 'avatar');
        assert.deepEqual(receivedInit?.headers, { accept: 'application/json' });
    });

    it('uploads a stream body with a caller-provided content type', async () => {
        let receivedInit: RequestInit | undefined;
        const definition = defineApi({
            uploadBackup: {
                method: 'POST',
                path: '/backups',
                body: streamBody(),
                response: v.object({ ok: v.boolean() }),
            },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            fetch: (_url, init) => {
                receivedInit = init;
                return Promise.resolve(new Response('{"ok":true}'));
            },
        });
        const stream = new Blob(['backup-bytes']).stream();

        const result = await api.uploadBackup({
            body: stream,
            headers: { 'content-type': 'application/octet-stream' },
        });

        assert.deepEqual(Result.unwrap(result), { ok: true });
        assert.equal(receivedInit?.body, stream);
        assert.deepEqual(receivedInit?.headers, {
            accept: 'application/json',
            'content-type': 'application/octet-stream',
        });
    });

    it('returns RequestValidationError when a marker body is missing or invalid', async () => {
        let fetchCalls = 0;
        const definition = defineApi({
            uploadAvatar: { method: 'POST', path: '/avatar', body: multipartBody(), response: v.unknown() },
            uploadBackup: { method: 'POST', path: '/backup', body: streamBody(), response: v.unknown() },
        });
        const api = createApi(definition, {
            baseUrl: '/api',
            fetch: () => {
                fetchCalls += 1;
                return Promise.resolve(new Response('{}'));
            },
        });

        // @ts-expect-error a marker body is required at the type level
        const missing = await api.uploadAvatar();
        const invalid = await api.uploadBackup({ body: 'raw-bytes' } as never);

        assert.equal(fetchCalls, 0);
        for (const result of [missing, invalid]) {
            assert.equal(Result.isFailure(result), true);
            if (Result.isFailure(result)) {
                assert.equal(result.error.type, 'RequestValidationError');
                assert.equal(result.error.section, 'body');
            }
        }
    });

    it('rejects endpoint definitions with a body that is neither a schema nor a marker', () => {
        const invalidBodies: readonly unknown[] = [42, 'json', {}, null];
        for (const body of invalidBodies) {
            assert.throws(
                () =>
                    createApi(
                        { invalid: { method: 'POST', path: '/items', body, response: v.unknown() } } as never,
                        { baseUrl: '/api' },
                    ),
                (error) => error instanceof InvalidEndpointDefinitionError && error.endpoint === 'invalid',
            );
        }
    });

    it('uploads multipart and stream bodies through real fetch to a real server', async () => {
        const { createServer } = await import('node:http');
        const server = createServer((request, response) => {
            const chunks: Buffer[] = [];
            request.on('data', (chunk: Buffer) => chunks.push(chunk));
            request.on('end', () => {
                response.setHeader('content-type', 'application/json');
                response.end(
                    JSON.stringify({
                        contentType: request.headers['content-type'],
                        body: Buffer.concat(chunks).toString('utf8'),
                    }),
                );
            });
        });
        await new Promise<void>((resolve) => server.listen(0, resolve));
        const { port } = server.address() as { port: number };

        try {
            const definition = defineApi({
                uploadAvatar: {
                    method: 'POST',
                    path: '/avatar',
                    body: multipartBody(),
                    response: v.object({ contentType: v.string(), body: v.string() }),
                },
                uploadBackup: {
                    method: 'POST',
                    path: '/backup',
                    body: streamBody(),
                    response: v.object({ contentType: v.string(), body: v.string() }),
                },
            });
            const api = createApi(definition, {
                baseUrl: `http://127.0.0.1:${port}`,
                headers: { 'content-type': 'application/json' },
            });

            const multipart = await api.uploadAvatar({
                body: { title: 'avatar', file: new Blob(['file-bytes']) },
                headers: { 'content-type': 'multipart/form-data; boundary=x' },
            });
            const multipartValue = Result.unwrap(multipart);
            assert.match(multipartValue.contentType, /^multipart\/form-data; boundary=/u);
            assert.match(multipartValue.body, /name="title"\r\n\r\navatar/u);
            assert.match(multipartValue.body, /name="file"; filename="blob"\r\n/u);
            assert.match(multipartValue.body, /file-bytes/u);

            const streamed = await api.uploadBackup({
                body: new Blob(['backup-bytes']).stream(),
                headers: { 'content-type': 'application/octet-stream' },
            });
            const streamedValue = Result.unwrap(streamed);
            assert.equal(streamedValue.contentType, 'application/octet-stream');
            assert.equal(streamedValue.body, 'backup-bytes');
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('shows streaming multipart parts to interceptors and a fake transport', async () => {
        let intercepted: TransportRequest | undefined;
        let transported: TransportRequest | undefined;
        const definition = defineApi({
            uploadFiles: {
                method: 'POST',
                path: '/files',
                body: multipartStreamBody(),
                response: v.object({ id: v.string() }),
            },
        });
        const transport: Transport<TransportFailure> = {
            request: async (request) => {
                transported = request;
                const body = request.body;
                assert.ok(body instanceof ReadableStream);
                const form = await new Response(body, {
                    headers: { 'content-type': request.headers['content-type'] },
                }).formData();
                assert.equal(form.get('title'), 'avatar');
                const files = form.getAll('file');
                const first = files[0];
                const second = files[1];
                assert.ok(first instanceof File && second instanceof File);
                if (first instanceof File && second instanceof File) {
                    assert.equal(first.name, 'фото.png');
                    assert.equal(first.type, 'image/png');
                    assert.equal(await first.text(), 'one');
                    assert.equal(second.name, 'b.txt');
                    assert.equal(second.type, 'text/plain');
                    assert.equal(await second.text(), 'two');
                }
                return Result.succeed({
                    status: 200,
                    statusText: 'OK',
                    headers: {},
                    body: '{"id":"file-1"}',
                });
            },
        };
        const api = createApi(definition, {
            baseUrl: '/api',
            headers: { 'content-type': 'application/json', authorization: 'Bearer client' },
            interceptors: [
                async (request, next) => {
                    intercepted = request;
                    return next(request);
                },
            ],
            transport,
        });

        const result = await api.uploadFiles({
            body: [
                { name: 'title', value: 'avatar' },
                {
                    name: 'file',
                    value: {
                        stream: new Blob(['one']).stream(),
                        filename: 'фото.png',
                        type: 'image/png',
                        size: 3,
                    },
                },
                {
                    name: 'file',
                    value: {
                        stream: new Blob(['two']).stream(),
                        filename: 'b.txt',
                        type: 'text/plain',
                        size: 3,
                    },
                },
            ],
            headers: { authorization: 'Bearer call', accept: 'application/json' },
        });

        assert.deepEqual(Result.unwrap(result), { id: 'file-1' });
        assert.equal(intercepted, transported);
        assert.match(intercepted?.headers['content-type'] ?? '', /^multipart\/form-data; boundary=/u);
        assert.equal(intercepted?.headers.authorization, 'Bearer call');
        assert.equal(intercepted?.headers.accept, 'application/json');
        assert.notEqual(intercepted?.headers['content-type'], 'application/json');
        assert.match(intercepted?.headers['content-length'] ?? '', /^[1-9]\d*$/u);
    });

    it('sends content-length only when every streaming file size is known', async () => {
        const { createServer } = await import('node:http');
        const seen: { contentLength: string | undefined; transferEncoding: string | undefined }[] = [];
        const server = createServer((request, response) => {
            seen.push({
                contentLength: request.headers['content-length'],
                transferEncoding: request.headers['transfer-encoding'],
            });
            const chunks: Buffer[] = [];
            request.on('data', (chunk: Buffer) => chunks.push(chunk));
            request.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                response.setHeader('content-type', 'application/json');
                response.end(
                    JSON.stringify({
                        contentType: request.headers['content-type'],
                        filename: /filename="([^"]*)"/u.exec(body)?.[1],
                        bytes: body.includes('file-bytes'),
                    }),
                );
            });
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (address === null || typeof address === 'string') {
            throw new Error('expected a TCP port');
        }

        try {
            const definition = defineApi({
                uploadFiles: {
                    method: 'POST',
                    path: '/files',
                    body: multipartStreamBody(),
                    response: v.object({
                        contentType: v.string(),
                        filename: v.string(),
                        bytes: v.boolean(),
                    }),
                },
            });
            const api = createApi(definition, {
                baseUrl: `http://127.0.0.1:${address.port}`,
                headers: { 'content-type': 'application/json' },
            });
            const file = { filename: 'фото.png', type: 'image/png' };

            const known = await api.uploadFiles({
                body: [
                    {
                        name: 'file',
                        value: { ...file, stream: new Blob(['file-bytes']).stream(), size: 10 },
                    },
                ],
            });
            const unknown = await api.uploadFiles({
                body: [{ name: 'file', value: { ...file, stream: new Blob(['file-bytes']).stream() } }],
            });

            const knownValue = Result.unwrap(known);
            assert.match(knownValue.contentType, /^multipart\/form-data; boundary=/u);
            assert.equal(knownValue.filename, 'фото.png');
            assert.equal(knownValue.bytes, true);
            assert.match(seen[0]?.contentLength ?? '', /^[1-9]\d*$/u);
            assert.equal(seen[0]?.transferEncoding, undefined);

            assert.equal(Result.isSuccess(unknown), true);
            assert.equal(seen[1]?.contentLength, undefined);
            assert.equal(seen[1]?.transferEncoding, 'chunked');
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('fails a streaming upload when the file stream breaks, the call is aborted, or HTTP fails', async () => {
        const { createServer } = await import('node:http');
        let arrived: () => void = () => undefined;
        const requestArrived = new Promise<void>((resolve) => {
            arrived = resolve;
        });
        const server = createServer((request, response) => {
            request.on('error', () => undefined);
            request.on('data', () => undefined);
            if (request.url === '/slow') {
                arrived();
                return;
            }
            if (request.url === '/break') {
                return;
            }
            request.on('end', () => {
                if (request.url === '/files') {
                    response.statusCode = 422;
                    response.end('nope');
                    return;
                }
                response.end('{"ok":true}');
            });
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (address === null || typeof address === 'string') {
            throw new Error('expected a TCP port');
        }

        try {
            const definition = defineApi({
                uploadFiles: {
                    method: 'POST',
                    path: '/files',
                    body: multipartStreamBody(),
                    response: v.object({ ok: v.boolean() }),
                },
                uploadBroken: {
                    method: 'POST',
                    path: '/break',
                    body: multipartStreamBody(),
                    response: v.object({ ok: v.boolean() }),
                },
                uploadSlow: {
                    method: 'POST',
                    path: '/slow',
                    body: multipartStreamBody(),
                    response: v.object({ ok: v.boolean() }),
                },
            });
            const api = createApi(definition, { baseUrl: `http://127.0.0.1:${address.port}` });
            const broken = await api.uploadBroken({
                body: [
                    {
                        name: 'file',
                        value: {
                            stream: new ReadableStream({
                                start(controller) {
                                    controller.enqueue(new Uint8Array([1]));
                                    controller.error(new Error('source broke'));
                                },
                            }),
                            filename: 'a.bin',
                            type: 'application/octet-stream',
                        },
                    },
                ],
            });
            assert.equal(Result.unwrapError(broken).type, 'TransportError');

            const httpError = await api.uploadFiles({
                body: [
                    {
                        name: 'file',
                        value: {
                            stream: new Blob(['ok']).stream(),
                            filename: 'a.bin',
                            type: 'application/octet-stream',
                            size: 2,
                        },
                    },
                ],
            });
            const httpFailure = Result.unwrapError(httpError);
            assert.equal(httpFailure.type, 'HttpError');
            if (httpFailure.type === 'HttpError') {
                assert.equal(httpFailure.status, 422);
                assert.equal(httpFailure.body, 'nope');
            }

            let stop = (): void => undefined;
            const controller = new AbortController();
            const aborted = api.uploadSlow({
                body: [
                    {
                        name: 'file',
                        value: {
                            stream: new ReadableStream<Uint8Array>({
                                pull() {
                                    return new Promise((resolve) => {
                                        stop = resolve;
                                    });
                                },
                                cancel() {
                                    stop();
                                },
                            }),
                            filename: 'a.bin',
                            type: 'application/octet-stream',
                        },
                    },
                ],
                signal: controller.signal,
            });
            await requestArrived;
            controller.abort('stop');
            const abortResult = await aborted;
            assert.equal(Result.unwrapError(abortResult).type, 'AbortError');
            if (Result.isFailure(abortResult) && abortResult.error.type === 'AbortError') {
                assert.equal(abortResult.error.reason, 'stop');
            }
        } finally {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        }
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
