import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';

import { createFetchTransport, type FetchImplementation } from './fetchTransport.ts';

describe('createFetchTransport', () => {
    it('calls fetch with the transport request and reads the response', async () => {
        let receivedInput: string | undefined;
        let receivedInit: RequestInit | undefined;
        const fetchImplementation: FetchImplementation = (input, init) => {
            receivedInput = input;
            receivedInit = init;
            return Promise.resolve(
                new Response('{"ok":true}', {
                    status: 201,
                    statusText: 'Created',
                    headers: { 'content-type': 'application/json' },
                }),
            );
        };
        const transport = createFetchTransport(fetchImplementation);

        const result = await transport.request({
            url: '/api/courses',
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{"name":"TypeScript"}',
        });

        assert.equal(receivedInput, '/api/courses');
        assert.equal(receivedInit?.method, 'POST');
        assert.deepEqual(receivedInit?.headers, { 'content-type': 'application/json' });
        assert.equal(receivedInit?.body, '{"name":"TypeScript"}');
        assert.deepEqual(Result.unwrap(result), {
            status: 201,
            statusText: 'Created',
            headers: { 'content-type': 'application/json' },
            body: '{"ok":true}',
        });
    });

    it('omits the body when it is absent', async () => {
        let receivedInit: RequestInit | undefined;
        const transport = createFetchTransport((_input, init) => {
            receivedInit = init;
            return Promise.resolve(new Response('{}'));
        });

        await transport.request({ url: '/ping', method: 'GET', headers: {} });

        assert.equal(Object.hasOwn(receivedInit ?? {}, 'body'), false);
    });

    it('passes AbortSignal to fetch', async () => {
        let receivedInit: RequestInit | undefined;
        const controller = new AbortController();
        const transport = createFetchTransport((_input, init) => {
            receivedInit = init;
            return Promise.resolve(new Response('{}'));
        });

        await transport.request({
            url: '/ping',
            method: 'GET',
            headers: {},
            signal: controller.signal,
        });

        assert.equal(receivedInit?.signal, controller.signal);
    });

    it('converts rejected fetch calls to TransportError failures', async () => {
        const cause = new Error('network unavailable');
        const transport = createFetchTransport(() => Promise.reject(cause));

        const result = await transport.request({ url: '/ping', method: 'GET', headers: {} });

        assert.deepEqual(Result.unwrapError(result), { type: 'TransportError', cause });
    });

    it('converts synchronous fetch errors to TransportError failures', async () => {
        const cause = new Error('invalid URL');
        const transport = createFetchTransport(() => {
            throw cause;
        });

        const result = await transport.request({ url: '/ping', method: 'GET', headers: {} });

        assert.deepEqual(Result.unwrapError(result), { type: 'TransportError', cause });
    });

    it('converts response body read errors to TransportError failures', async () => {
        const cause = new Error('connection closed');
        const stream = new ReadableStream({
            start(controller) {
                controller.error(cause);
            },
        });
        const transport = createFetchTransport(() => Promise.resolve(new Response(stream)));

        const result = await transport.request({ url: '/ping', method: 'GET', headers: {} });

        assert.deepEqual(Result.unwrapError(result), { type: 'TransportError', cause });
    });
});
