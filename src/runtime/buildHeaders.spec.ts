import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';

import { buildHeaders } from './buildHeaders.ts';

describe('buildHeaders', () => {
    it('normalizes names and applies layer precedence', () => {
        const result = buildHeaders(
            false,
            { Authorization: 'client', ACCEPT: 'application/problem+json' },
            { authorization: 'call', accept: 'application/json' },
        );

        assert.deepEqual(Result.unwrap(result), {
            accept: 'application/json',
            authorization: 'call',
        });
    });

    it('allows later layers to remove defaults and inherited values', () => {
        const result = buildHeaders(
            false,
            { authorization: 'client' },
            { ACCEPT: undefined, Authorization: undefined },
        );

        assert.deepEqual(Result.unwrap(result), {});
    });

    it('adds content type only for a body and lets calls override it', () => {
        assert.deepEqual(Result.unwrap(buildHeaders(false)), {
            accept: 'application/json',
        });
        assert.deepEqual(Result.unwrap(buildHeaders(true, { 'Content-Type': 'custom/type' })), {
            accept: 'application/json',
            'content-type': 'custom/type',
        });
        assert.deepEqual(Result.unwrap(buildHeaders(true, { 'content-type': undefined })), {
            accept: 'application/json',
        });
    });

    it('returns failures for invalid names, values, and proxies', () => {
        const proxy = new Proxy(
            {},
            {
                ownKeys() {
                    throw new Error('header proxy');
                },
            },
        );
        const results = [
            buildHeaders(false, { 'bad name': 'value' }),
            buildHeaders(false, { valid: 'bad\r\nvalue' }),
            buildHeaders(false, proxy),
        ];

        for (const result of results) {
            const error = Result.unwrapError(result);
            assert.equal(error.type, 'RequestValidationError');
            assert.equal(error.section, 'headers');
        }
    });

    it('ignores inherited header entries and catches throwing own getters', () => {
        const inherited = Object.assign(Object.create({ authorization: 'inherited' }), {
            own: 'value',
        }) as Readonly<Record<string, string>>;
        const getterCause = new Error('header getter');
        const throwing = Object.defineProperty({}, 'authorization', {
            enumerable: true,
            get() {
                throw getterCause;
            },
        });

        assert.deepEqual(Result.unwrap(buildHeaders(false, inherited)), {
            accept: 'application/json',
            own: 'value',
        });
        const error = Result.unwrapError(buildHeaders(false, throwing));
        assert.equal(error.section, 'headers');
        assert.equal(error.cause, getterCause);
    });

    it('treats prototype-sensitive names as ordinary headers', () => {
        const result = Result.unwrap(buildHeaders(false, { ['__proto__']: 'value' }));

        assert.equal(Object.hasOwn(result, '__proto__'), true);
        assert.equal(result['__proto__'], 'value');
        assert.equal(Object.getPrototypeOf(result), Object.prototype);
    });
});
