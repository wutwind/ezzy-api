import { Result } from '@praha/byethrow';

import {
    type MultipartBodySerializationError,
    createMultipartBodySerializationError,
} from './multipartBodySerializationError.ts';

export type {
    MultipartBodySerializationError,
    MultipartBodySerializationReason,
} from './multipartBodySerializationError.ts';

interface InvalidField {
    readonly key: string;
    readonly value: unknown;
}

function isFormDataLike(value: object): value is FormData {
    return (
        typeof Reflect.get(value, 'append') === 'function' &&
        typeof Reflect.get(value, 'getAll') === 'function' &&
        typeof Reflect.get(value, 'entries') === 'function'
    );
}

function isBlobLike(value: unknown): value is Blob {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    return (
        typeof Reflect.get(value, 'size') === 'number' &&
        typeof Reflect.get(value, 'arrayBuffer') === 'function' &&
        typeof Reflect.get(value, 'stream') === 'function'
    );
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    return (
        !isFormDataLike(value) && !isBlobLike(value) && typeof Reflect.get(value, 'getReader') !== 'function'
    );
}

function invalidField(key: string, value: unknown): MultipartBodySerializationError {
    const invalid: InvalidField = { key, value };
    return createMultipartBodySerializationError('InvalidValue', invalid);
}

function appendScalar(
    form: FormData,
    key: string,
    value: string | number | boolean,
): Result.Result<void, MultipartBodySerializationError> {
    if (typeof value === 'number' && !Number.isFinite(value)) {
        return Result.fail(invalidField(key, value));
    }
    form.append(key, String(value));
    return Result.succeed();
}

function appendRecordValue(
    form: FormData,
    key: string,
    value: unknown,
): Result.Result<void, MultipartBodySerializationError> {
    if (value == null) {
        return Result.succeed();
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return appendScalar(form, key, value);
    }
    if (isBlobLike(value)) {
        form.append(key, value);
        return Result.succeed();
    }
    return Result.fail(invalidField(key, value));
}

function appendRecord(
    form: FormData,
    record: Readonly<Record<string, unknown>>,
): Result.Result<void, MultipartBodySerializationError> {
    for (const [key, value] of Object.entries(record)) {
        const appended = appendRecordValue(form, key, value);
        if (Result.isFailure(appended)) {
            return appended;
        }
    }
    return Result.succeed();
}

export function serializeMultipartBody(
    body: unknown,
): Result.Result<FormData, MultipartBodySerializationError> {
    if (body == null) {
        return Result.fail(createMultipartBodySerializationError('MissingBody'));
    }

    if (typeof body === 'object' && body !== null && isFormDataLike(body)) {
        return Result.succeed(body);
    }

    if (!isPlainRecord(body)) {
        return Result.fail(
            createMultipartBodySerializationError('InvalidValue', 'expected FormData or a record of fields'),
        );
    }

    const form = new globalThis.FormData();
    const appended = appendRecord(form, body);
    return Result.isFailure(appended) ? appended : Result.succeed(form);
}
