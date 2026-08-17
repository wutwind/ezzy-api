import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeQuery, type QueryValue, type QueryValues } from './serializeQuery.ts';

test('serializes primitive values', () => {
    assert.deepEqual(serializeQuery({ page: 2, search: 'types', active: true }), {
        type: 'Success',
        value: 'page=2&search=types&active=true',
    });
});

test('encodes keys, reserved characters, and Unicode', () => {
    assert.deepEqual(serializeQuery({ 'search term': 'TypeScript/API', language: 'English ☕' }), {
        type: 'Success',
        value: 'search%20term=TypeScript%2FAPI&language=English%20%E2%98%95',
    });
});

test('omits undefined values', () => {
    assert.deepEqual(serializeQuery({ page: undefined, search: 'types' }), {
        type: 'Success',
        value: 'search=types',
    });
});

test('serializes arrays as repeated keys by default', () => {
    assert.deepEqual(serializeQuery({ tag: ['ts', 'api'], page: [1, 2] }), {
        type: 'Success',
        value: 'tag=ts&tag=api&page=1&page=2',
    });
});

test('serializes arrays with bracketed keys', () => {
    assert.deepEqual(serializeQuery({ tag: ['ts', 'api'] }, { arrayFormat: 'brackets' }), {
        type: 'Success',
        value: 'tag[]=ts&tag[]=api',
    });
});

test('serializes arrays as comma-separated values', () => {
    assert.deepEqual(serializeQuery({ tag: ['ts', 'api'], page: [1, 2] }, { arrayFormat: 'comma' }), {
        type: 'Success',
        value: 'tag=ts,api&page=1,2',
    });
});

test('encodes commas inside values without encoding comma separators', () => {
    assert.deepEqual(serializeQuery({ tag: ['ts,js', 'api'] }, { arrayFormat: 'comma' }), {
        type: 'Success',
        value: 'tag=ts%2Cjs,api',
    });
});

test('omits empty arrays', () => {
    assert.deepEqual(serializeQuery({ tag: [] }), {
        type: 'Success',
        value: '',
    });
});

test('serializes an empty query', () => {
    assert.deepEqual(serializeQuery({}), {
        type: 'Success',
        value: '',
    });
});

test('ignores inherited enumerable properties', () => {
    const query = Object.assign(Object.create({ inherited: 'value' }), { own: 'value' }) as QueryValues;

    assert.deepEqual(serializeQuery(query), {
        type: 'Success',
        value: 'own=value',
    });
});

for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    test(`returns a failure for the non-finite number ${String(value)}`, () => {
        assert.deepEqual(serializeQuery({ page: value }), {
            type: 'Failure',
            error: {
                type: 'InvalidQueryValue',
                key: 'page',
                reason: 'NonFiniteNumber',
            },
        });
    });
}

test('returns a failure for unsupported values from JavaScript callers', () => {
    const unsupported = { nested: true } as unknown as QueryValue;

    assert.deepEqual(serializeQuery({ filter: unsupported }), {
        type: 'Failure',
        error: {
            type: 'InvalidQueryValue',
            key: 'filter',
            reason: 'UnsupportedType',
        },
    });
});

test('returns a failure for unsupported array items from JavaScript callers', () => {
    const unsupported = ['valid', null] as unknown as QueryValue;

    assert.deepEqual(serializeQuery({ tag: unsupported }), {
        type: 'Failure',
        error: {
            type: 'InvalidQueryValue',
            key: 'tag',
            reason: 'UnsupportedType',
        },
    });
});

test('returns a failure when a key cannot be URL-encoded', () => {
    assert.deepEqual(serializeQuery({ ['\uD800']: 'value' }), {
        type: 'Failure',
        error: {
            type: 'InvalidQueryValue',
            key: '\uD800',
            reason: 'InvalidEncoding',
        },
    });
});

test('returns a failure when a value cannot be URL-encoded', () => {
    assert.deepEqual(serializeQuery({ search: '\uD800' }), {
        type: 'Failure',
        error: {
            type: 'InvalidQueryValue',
            key: 'search',
            reason: 'InvalidEncoding',
        },
    });
});

test('returns a failure for an unsupported array format from JavaScript callers', () => {
    assert.deepEqual(serializeQuery({}, { arrayFormat: 'unknown' as 'repeat' }), {
        type: 'Failure',
        error: {
            type: 'InvalidQueryArrayFormat',
            format: 'unknown',
        },
    });
});
