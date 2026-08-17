import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';

import { serializeJsonBody } from './serializeJsonBody.ts';

describe('serializeJsonBody', () => {
    it('serializes an object as JSON', () => {
        const result = serializeJsonBody({ name: 'TypeScript', published: true });

        assert.equal(Result.unwrap(result), '{"name":"TypeScript","published":true}');
    });

    it('preserves JSON.stringify semantics for nested data', () => {
        const result = serializeJsonBody({ tags: ['api', 'typed'], metadata: null });

        assert.equal(Result.unwrap(result), '{"tags":["api","typed"],"metadata":null}');
    });

    it('returns a failure when JSON.stringify produces no body', () => {
        const result = serializeJsonBody(undefined);

        assert.deepEqual(Result.unwrapError(result), {
            type: 'JsonBodySerializationError',
            reason: 'UnsupportedValue',
        });
    });

    it('returns a failure for cyclic values', () => {
        const body: Record<string, unknown> = {};
        body.self = body;

        const result = serializeJsonBody(body);

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
            assert.equal(result.error.type, 'JsonBodySerializationError');
            assert.equal(result.error.reason, 'SerializationFailed');
            assert.ok(result.error.cause instanceof TypeError);
        }
    });

    it('returns a failure for bigint values', () => {
        const result = serializeJsonBody({ value: 1n });

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
            assert.equal(result.error.reason, 'SerializationFailed');
            assert.ok(result.error.cause instanceof TypeError);
        }
    });
});
