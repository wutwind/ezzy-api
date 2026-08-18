import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPath } from './buildPath.ts';

test('builds a path with one parameter', () => {
    assert.deepEqual(buildPath('/courses/:id', { id: '123' }), {
        type: 'Success',
        value: '/courses/123',
    });
});

test('builds a path with multiple parameters', () => {
    assert.deepEqual(
        buildPath('/courses/:courseId/lessons/:lessonId', {
            courseId: 'course-1',
            lessonId: 'lesson-2',
        }),
        {
            type: 'Success',
            value: '/courses/course-1/lessons/lesson-2',
        },
    );
});

test('encodes reserved characters in parameter values', () => {
    assert.deepEqual(buildPath('/files/:name', { name: 'foo/bar?' }), {
        type: 'Success',
        value: '/files/foo%2Fbar%3F',
    });
});

test('encodes Unicode parameter values', () => {
    assert.deepEqual(buildPath('/courses/:name', { name: 'Data types 📘' }), {
        type: 'Success',
        value: '/courses/Data%20types%20%F0%9F%93%98',
    });
});

test('replaces repeated parameters', () => {
    assert.deepEqual(buildPath('/:id/related/:id', { id: '123' }), {
        type: 'Success',
        value: '/123/related/123',
    });
});

test('accepts an empty parameter object for a static path', () => {
    assert.deepEqual(buildPath('/health', {}), {
        type: 'Success',
        value: '/health',
    });
});

test('returns a failure for a missing parameter', () => {
    assert.deepEqual(buildPath('/courses/:id', {}), {
        type: 'Failure',
        error: {
            type: 'MissingPathParameter',
            parameter: 'id',
        },
    });
});

test('returns a failure for an unexpected parameter', () => {
    assert.deepEqual(buildPath('/courses/:id', { id: '123', extra: 'value' }), {
        type: 'Failure',
        error: {
            type: 'UnexpectedPathParameter',
            parameter: 'extra',
        },
    });
});

test('returns a failure for a non-string parameter from JavaScript callers', () => {
    assert.deepEqual(buildPath('/courses/:id', { id: 123 as unknown as string }), {
        type: 'Failure',
        error: {
            type: 'InvalidPathParameter',
            parameter: 'id',
            reason: 'NotString',
        },
    });
});

test('returns a failure when a parameter cannot be URL-encoded', () => {
    assert.deepEqual(buildPath('/courses/:id', { id: '\uD800' }), {
        type: 'Failure',
        error: {
            type: 'InvalidPathParameter',
            parameter: 'id',
            reason: 'InvalidEncoding',
        },
    });
});
