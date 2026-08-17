import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';
import * as v from 'valibot';

import { validateResponse } from './validateResponse.ts';

describe('validateResponse', () => {
    it('returns a valid response', async () => {
        const schema = v.object({ id: v.string(), name: v.string() });

        const result = await validateResponse(schema, { id: 'course-1', name: 'TypeScript' });

        assert.deepEqual(Result.unwrap(result), { id: 'course-1', name: 'TypeScript' });
    });

    it('returns transformed schema output', async () => {
        const schema = v.pipe(
            v.string(),
            v.transform((value) => new Date(value)),
        );

        const result = await validateResponse(schema, '2026-08-14T00:00:00.000Z');

        assert.deepEqual(Result.unwrap(result), new Date('2026-08-14T00:00:00.000Z'));
    });

    it('returns schema issues for an invalid server response', async () => {
        const schema = v.object({ id: v.string() });

        const result = await validateResponse(schema, { id: 123 });

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
            assert.equal(result.error.type, 'ResponseValidationError');
            assert.equal(result.error.reason, 'SchemaValidation');
            if (result.error.reason === 'SchemaValidation') {
                assert.ok(result.error.issues.length > 0);
            }
        }
    });

    it('converts validator errors to ResponseValidationError failures', async () => {
        const cause = new Error('validator crashed');
        const schema = {
            '~standard': {
                version: 1,
                vendor: 'test',
                validate: () => {
                    throw cause;
                },
            },
        } as const;

        const result = await validateResponse(schema, {});

        assert.deepEqual(Result.unwrapError(result), {
            type: 'ResponseValidationError',
            reason: 'SchemaError',
            cause,
        });
    });
});
