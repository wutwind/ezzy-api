import { Result } from '@praha/byethrow';

import {
    type JsonBodySerializationError,
    createJsonBodySerializationError,
} from './jsonBodySerializationError.ts';
import { safeJsonStringify } from './safeJson.ts';

export type {
    JsonBodySerializationError,
    JsonBodySerializationReason,
} from './jsonBodySerializationError.ts';

export function serializeJsonBody(body: unknown): Result.Result<string, JsonBodySerializationError> {
    const serialized = safeJsonStringify(body);
    if (Result.isFailure(serialized)) {
        return Result.fail(createJsonBodySerializationError('SerializationFailed', serialized.error));
    }
    return serialized.value === undefined
        ? Result.fail(createJsonBodySerializationError('UnsupportedValue'))
        : Result.succeed(serialized.value);
}
