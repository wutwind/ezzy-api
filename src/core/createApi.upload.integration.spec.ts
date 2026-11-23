import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';
import * as v from 'valibot';

import type { TransportFailure } from '../transport/interceptors.ts';
import type { Transport, TransportRequest } from '../transport/types.ts';
import { multipartBody, multipartStreamBody, streamBody } from './bodyKinds.ts';
import { createApi } from './createApi.ts';
import { defineApi } from './defineApi.ts';

describe('createApi upload integration', () => {
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
});
