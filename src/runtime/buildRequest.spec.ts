import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';
import * as v from 'valibot';

import { buildRequest } from './buildRequest.ts';

const response = v.object({ ok: v.boolean() });

describe('buildRequest', () => {
    it('builds path, query, and JSON body', () => {
        const endpoint = {
            method: 'POST',
            path: '/courses/:id',
            params: v.object({ id: v.string() }),
            query: v.object({ tag: v.array(v.string()) }),
            body: v.object({ name: v.string() }),
            response,
        } as const;

        const result = buildRequest(
            endpoint,
            {
                params: { id: 'course/1' },
                query: { tag: ['api', 'typed'] },
                body: { name: 'TypeScript' },
            },
            {
                baseUrl: '/api/',
                headers: { accept: 'application/json', 'content-type': 'application/json' },
            },
        );

        assert.deepEqual(Result.unwrap(result), {
            url: '/api/courses/course%2F1?tag=api&tag=typed',
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/json' },
            body: '{"name":"TypeScript"}',
        });
    });

    it('builds a request without optional sections', () => {
        const endpoint = { method: 'GET', path: '/ping', response } as const;

        const result = buildRequest(
            endpoint,
            {},
            {
                baseUrl: 'https://example.com/api',
                headers: { accept: 'application/json' },
            },
        );

        assert.deepEqual(Result.unwrap(result), {
            url: 'https://example.com/api/ping',
            method: 'GET',
            headers: { accept: 'application/json' },
        });
    });

    it('maps invalid transformed params to RequestValidationError', () => {
        const endpoint = {
            method: 'GET',
            path: '/courses/:id',
            params: v.object({ id: v.string() }),
            response,
        } as const;

        // Simulates a schema transform whose output is unsuitable for a URL segment.
        // @ts-expect-error validated output deliberately violates the endpoint schema
        const result = buildRequest(endpoint, { params: { id: 1 } }, { baseUrl: '', headers: {} });

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
            assert.equal(result.error.type, 'RequestValidationError');
            assert.equal(result.error.section, 'params');
        }
    });

    it('maps unsupported query output to RequestValidationError', () => {
        const endpoint = {
            method: 'GET',
            path: '/courses',
            query: v.object({ page: v.number() }),
            response,
        } as const;

        const result = buildRequest(endpoint, { query: { page: Number.NaN } }, { baseUrl: '', headers: {} });

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
            assert.equal(result.error.section, 'query');
        }
    });

    it('maps JSON serialization failures to RequestValidationError', () => {
        const endpoint = {
            method: 'POST',
            path: '/courses',
            body: v.object({ value: v.string() }),
            response,
        } as const;
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;

        // @ts-expect-error validated output deliberately violates the endpoint schema
        const result = buildRequest(endpoint, { body: cyclic }, { baseUrl: '', headers: {} });

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
            assert.equal(result.error.section, 'body');
        }
    });
});
