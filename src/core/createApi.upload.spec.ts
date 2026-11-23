import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';
import * as v from 'valibot';

import { multipartBody, multipartStreamBody, streamBody } from './bodyKinds.ts';
import { createApi } from './createApi.ts';
import { defineApi } from './defineApi.ts';

const CourseSchema = v.object({ id: v.string(), name: v.string() });

describe('createApi upload validation', () => {
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

    it('rejects a file stream reused in multipart fields before calling the transport', async () => {
        let fetchCalls = 0;
        const api = createApi(
            defineApi({
                upload: {
                    method: 'POST',
                    path: '/upload',
                    body: multipartStreamBody(),
                    response: v.unknown(),
                },
            }),
            {
                baseUrl: '/api',
                fetch: () => {
                    fetchCalls += 1;
                    return Promise.resolve(new Response('{}'));
                },
            },
        );

        for (const size of [undefined, 3]) {
            const stream = new Blob(['abc']).stream();
            const file = { stream, filename: 'a.txt', type: 'text/plain', size };
            const result = await api.upload({
                body: [
                    { name: 'first', value: file },
                    { name: 'second', value: file },
                ],
            });
            assert.equal(Result.isFailure(result), true);
            if (Result.isFailure(result)) {
                assert.equal(result.error.type, 'RequestValidationError');
                assert.equal(result.error.section, 'body');
            }
            assert.equal(stream.locked, false);
        }
        assert.equal(fetchCalls, 0);
    });
});
