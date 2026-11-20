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

function isFormDataLike(value: object): boolean {
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
    // FormData and ReadableStream are objects but not field records.
    return (
        !isFormDataLike(value) && !isBlobLike(value) && typeof Reflect.get(value, 'getReader') !== 'function'
    );
}

function appendRecordValue(form: FormData, key: string, value: unknown): boolean {
    if (value === undefined) {
        return true;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        form.append(key, String(value));
        return true;
    }
    if (isBlobLike(value)) {
        form.append(key, value);
        return true;
    }
    return false;
}

function appendRecord(
    form: FormData,
    record: Readonly<Record<string, unknown>>,
): Result.Result<undefined, MultipartBodySerializationError> {
    for (const [key, value] of Object.entries(record)) {
        if (!appendRecordValue(form, key, value)) {
            const invalid: InvalidField = { key, value };
            return Result.fail(createMultipartBodySerializationError('InvalidValue', invalid));
        }
    }
    return Result.succeed(undefined);
}

/** Converts a multipart body input to FormData; FormData passes through by reference. */
export function serializeMultipartBody(
    body: unknown,
): Result.Result<FormData, MultipartBodySerializationError> {
    if (body === undefined) {
        return Result.fail(createMultipartBodySerializationError('MissingBody'));
    }

    if (typeof body === 'object' && body !== null && isFormDataLike(body)) {
        // Cross-realm FormData instances are structurally identical.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        return Result.succeed(body as FormData);
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
