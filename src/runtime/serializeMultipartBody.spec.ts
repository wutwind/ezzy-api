import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';

import { serializeMultipartBody } from './serializeMultipartBody.ts';

describe('serializeMultipartBody', () => {
    it('passes FormData through by reference', () => {
        const form = new FormData();
        form.append('title', 'avatar');

        const result = serializeMultipartBody(form);

        assert.equal(Result.unwrap(result), form);
    });

    it('converts a record with scalars and Blobs', async () => {
        const file = new Blob(['file-bytes'], { type: 'text/plain' });

        const result = serializeMultipartBody({ title: 'avatar', order: 3, active: true, file });

        const form = Result.unwrap(result);
        assert.ok(form instanceof FormData);
        assert.equal(form.get('title'), 'avatar');
        assert.equal(form.get('order'), '3');
        assert.equal(form.get('active'), 'true');
        const received = form.get('file');
        assert.ok(received instanceof Blob);
        assert.equal(await received.text(), 'file-bytes');
    });

    it('skips nullish record fields', () => {
        const result = serializeMultipartBody({ title: 'avatar', subtitle: undefined, note: null });

        const form = Result.unwrap(result);
        assert.equal(form.get('title'), 'avatar');
        assert.equal(form.has('subtitle'), false);
        assert.equal(form.has('note'), false);
    });

    it('fails when the body is missing', () => {
        for (const body of [undefined, null]) {
            const result = serializeMultipartBody(body);

            assert.deepEqual(Result.unwrapError(result), {
                type: 'MultipartBodySerializationError',
                reason: 'MissingBody',
            });
        }
    });

    it('fails for values that are neither FormData nor a record', () => {
        for (const body of ['title=avatar', 42, new ReadableStream()]) {
            const result = serializeMultipartBody(body);

            const error = Result.unwrapError(result);
            assert.equal(error.type, 'MultipartBodySerializationError');
            assert.equal(error.reason, 'InvalidValue');
        }
    });

    it('fails for unsupported record field values', () => {
        for (const value of [Number.NaN, Number.POSITIVE_INFINITY, ['a'], { nested: 'object' }, () => 'fn']) {
            const result = serializeMultipartBody({ field: value });

            const error = Result.unwrapError(result);
            assert.equal(error.type, 'MultipartBodySerializationError');
            assert.equal(error.reason, 'InvalidValue');
            assert.deepEqual(error.cause, { key: 'field', value });
        }
    });

    it('fails for arrays and Blobs at the top level', () => {
        for (const body of [['a', 'b'], new Blob(['bytes'])]) {
            const result = serializeMultipartBody(body);

            const error = Result.unwrapError(result);
            assert.equal(error.type, 'MultipartBodySerializationError');
            assert.equal(error.reason, 'InvalidValue');
        }
    });
});
