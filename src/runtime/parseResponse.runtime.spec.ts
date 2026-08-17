import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';

import { parseResponse } from './parseResponse.ts';

describe('parseResponse', () => {
    it('parses a successful JSON response', () => {
        const result = parseResponse({
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: '{"id":"course-1"}',
        });

        assert.deepEqual(Result.unwrap(result), { id: 'course-1' });
    });

    it('accepts every 2xx status and valid JSON primitives', () => {
        const result = parseResponse({
            status: 299,
            statusText: '',
            headers: {},
            body: 'null',
        });

        assert.equal(Result.unwrap(result), null);
    });

    it('passes an empty successful response to the schema as undefined', () => {
        for (const status of [200, 204, 205]) {
            const result = parseResponse({ status, statusText: '', headers: {}, body: '' });
            assert.equal(Result.unwrap(result), undefined);
        }
    });

    it('returns HttpError before trying to parse an error response', () => {
        const result = parseResponse({
            status: 404,
            statusText: 'Not Found',
            headers: {},
            body: 'not JSON',
        });

        assert.deepEqual(Result.unwrapError(result), {
            type: 'HttpError',
            status: 404,
            statusText: 'Not Found',
            body: 'not JSON',
        });
    });

    it('treats redirects as HTTP failures', () => {
        const result = parseResponse({
            status: 302,
            statusText: 'Found',
            headers: { location: '/login' },
            body: '',
        });

        assert.equal(Result.unwrapError(result).type, 'HttpError');
    });

    it('returns ResponseValidationError for malformed JSON', () => {
        const result = parseResponse({
            status: 200,
            statusText: 'OK',
            headers: {},
            body: '{invalid',
        });

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
            assert.equal(result.error.type, 'ResponseValidationError');
            if (result.error.type === 'ResponseValidationError') {
                assert.equal(result.error.reason, 'InvalidJson');
                assert.ok(result.error.cause instanceof SyntaxError);
            }
        }
    });
});
