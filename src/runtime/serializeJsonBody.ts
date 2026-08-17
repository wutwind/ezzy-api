import { Result } from '@praha/byethrow';

import {
    type JsonBodySerializationError,
    createJsonBodySerializationError,
} from './serializeJsonBody.errors.ts';

export type { JsonBodySerializationError, JsonBodySerializationReason } from './serializeJsonBody.errors.ts';

const stringifyJson: (value: unknown) => string | undefined = JSON.stringify;

/** Serializes a schema-validated request body as JSON. */
export function serializeJsonBody(body: unknown): Result.Result<string, JsonBodySerializationError> {
    try {
        const serialized = stringifyJson(body);

        return serialized === undefined
            ? Result.fail(createJsonBodySerializationError('UnsupportedValue'))
            : Result.succeed(serialized);
    } catch (error) {
        return Result.fail(createJsonBodySerializationError('SerializationFailed', error));
    }
}
