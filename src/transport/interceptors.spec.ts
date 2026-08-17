import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';

import { applyTransportInterceptors, type TransportInterceptor } from './interceptors.ts';
import type { Transport } from './types.ts';

describe('applyTransportInterceptors', () => {
    it('runs request handlers in declaration order and response handlers in reverse order', async () => {
        const events: string[] = [];
        const transport: Transport<never> = {
            request: async () => {
                events.push('transport');
                return Result.succeed({ status: 200, statusText: 'OK', headers: {}, body: '{}' });
            },
        };
        const createInterceptor =
            (name: string): TransportInterceptor =>
            async (request, next) => {
                events.push(`${name}:request`);
                const response = await next(request);
                events.push(`${name}:response`);
                return response;
            };
        const intercepted = applyTransportInterceptors(transport, [
            createInterceptor('first'),
            createInterceptor('second'),
        ]);

        await intercepted.request({ url: '/ping', method: 'GET', headers: {} });

        assert.deepEqual(events, [
            'first:request',
            'second:request',
            'transport',
            'second:response',
            'first:response',
        ]);
    });

    it('converts a thrown interceptor error to TransportError', async () => {
        const cause = new Error('interceptor failed');
        const transport: Transport<never> = {
            request: async () => Result.succeed({ status: 200, statusText: 'OK', headers: {}, body: '{}' }),
        };
        const intercepted = applyTransportInterceptors(transport, [() => Promise.reject(cause)]);

        const result = await intercepted.request({ url: '/ping', method: 'GET', headers: {} });

        assert.deepEqual(Result.unwrapError(result), { type: 'TransportError', cause });
    });

    it('allows an interceptor to retry by invoking next more than once', async () => {
        let calls = 0;
        const transport: Transport<never> = {
            request: async () => {
                calls += 1;
                return Result.succeed({
                    status: calls === 1 ? 503 : 200,
                    statusText: '',
                    headers: {},
                    body: '{}',
                });
            },
        };
        const retry: TransportInterceptor = async (request, next) => {
            const first = await next(request);
            return Result.isSuccess(first) && first.value.status === 503 ? next(request) : first;
        };
        const intercepted = applyTransportInterceptors(transport, [retry]);

        const result = await intercepted.request({ url: '/ping', method: 'GET', headers: {} });

        assert.equal(Result.unwrap(result).status, 200);
        assert.equal(calls, 2);
    });
});
