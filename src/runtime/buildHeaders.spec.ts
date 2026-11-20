import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';

import { buildHeaders } from './buildHeaders.ts';

describe('buildHeaders', () => {
    it('normalizes names and applies layer precedence', () => {
        const result = buildHeaders(
            'none',
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
            'none',
            { authorization: 'client' },
            { ACCEPT: undefined, Authorization: undefined },
        );

        assert.deepEqual(Result.unwrap(result), {});
    });

    it('adds content type only for a JSON body and lets calls override it', () => {
        assert.deepEqual(Result.unwrap(buildHeaders('none')), {
            accept: 'application/json',
        });
        assert.deepEqual(Result.unwrap(buildHeaders('json', { 'Content-Type': 'custom/type' })), {
            accept: 'application/json',
            'content-type': 'custom/type',
        });
        assert.deepEqual(Result.unwrap(buildHeaders('json', { 'content-type': undefined })), {
            accept: 'application/json',
        });
    });

    it('sets no default content type for multipart and stream bodies', () => {
        assert.deepEqual(Result.unwrap(buildHeaders('multipart')), {
            accept: 'application/json',
        });
        assert.deepEqual(Result.unwrap(buildHeaders('stream')), {
            accept: 'application/json',
        });
    });

    it('drops multipart content type from every layer and keeps a stream media type', () => {
        assert.deepEqual(
            Result.unwrap(
                buildHeaders(
                    'multipart',
                    { 'content-type': 'application/json' },
                    { 'Content-Type': 'multipart/form-data; boundary=x' },
                ),
            ),
            { accept: 'application/json' },
        );
        assert.deepEqual(
            Result.unwrap(buildHeaders('stream', { 'content-type': 'application/octet-stream' })),
            {
                accept: 'application/json',
                'content-type': 'application/octet-stream',
            },
        );
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
            buildHeaders('none', { 'bad name': 'value' }),
            buildHeaders('none', { valid: 'bad\r\nvalue' }),
            buildHeaders('none', proxy),
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

        assert.deepEqual(Result.unwrap(buildHeaders('none', inherited)), {
            accept: 'application/json',
            own: 'value',
        });
        const error = Result.unwrapError(buildHeaders('none', throwing));
        assert.equal(error.section, 'headers');
        assert.equal(error.cause, getterCause);
    });

    it('treats prototype-sensitive names as ordinary headers', () => {
        const result = Result.unwrap(buildHeaders('none', { ['__proto__']: 'value' }));

        assert.equal(Object.hasOwn(result, '__proto__'), true);
        assert.equal(result['__proto__'], 'value');
        assert.equal(Object.getPrototypeOf(result), Object.prototype);
    });
});
