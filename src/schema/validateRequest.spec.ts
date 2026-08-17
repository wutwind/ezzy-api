import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';
import * as v from 'valibot';

import { validateRequest } from './validateRequest.ts';

const response = v.object({ ok: v.boolean() });

describe('validateRequest', () => {
    it('validates params, query, and body', async () => {
        const endpoint = {
            method: 'POST',
            path: '/courses/:id',
            params: v.object({ id: v.string() }),
            query: v.object({ publish: v.boolean() }),
            body: v.object({ name: v.string() }),
            response,
        } as const;
        const result = await validateRequest(endpoint, {
            params: { id: 'course-1' },
            query: { publish: true },
            body: { name: 'TypeScript' },
        });

        assert.deepEqual(Result.unwrap(result), {
            params: { id: 'course-1' },
            query: { publish: true },
            body: { name: 'TypeScript' },
        });
    });

    it('uses schema outputs after transforms', async () => {
        const endpoint = {
            method: 'POST',
            path: '/items',
            body: v.object({
                amount: v.pipe(
                    v.string(),
                    v.transform((value) => Number(value)),
                ),
            }),
            response,
        } as const;
        const result = await validateRequest(endpoint, { body: { amount: '42' } });

        assert.deepEqual(Result.unwrap(result), { body: { amount: 42 } });
    });

    it('validates an omitted optional section as an empty object', async () => {
        const endpoint = {
            method: 'GET',
            path: '/items',
            query: v.object({ page: v.optional(v.number()) }),
            response,
        } as const;
        const result = await validateRequest(endpoint);

        assert.deepEqual(Result.unwrap(result), { query: {} });
    });

    it('returns the failing request section and schema issues', async () => {
        const endpoint = {
            method: 'POST',
            path: '/items',
            body: v.object({ name: v.string() }),
            response,
        } as const;
        const result = await validateRequest(endpoint, { body: {} });

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
            assert.equal(result.error.type, 'RequestValidationError');
            assert.equal(result.error.section, 'body');
            assert.ok(result.error.issues.length > 0);
        }
    });

    it('does not validate undeclared sections', async () => {
        const endpoint = { method: 'GET', path: '/ping', response } as const;
        const result = await validateRequest(endpoint, { body: { ignored: true } });

        assert.deepEqual(Result.unwrap(result), {});
    });

    it('converts rejected validator errors to failures', async () => {
        const cause = new Error('validator crashed');
        const endpoint = {
            method: 'POST',
            path: '/items',
            body: {
                '~standard': {
                    version: 1,
                    vendor: 'test',
                    validate: async () => Promise.reject(cause),
                },
            },
            response,
        } as const;
        const result = await validateRequest(endpoint, { body: {} });

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
            assert.equal(result.error.section, 'body');
            assert.equal(result.error.cause, cause);
        }
    });
});
