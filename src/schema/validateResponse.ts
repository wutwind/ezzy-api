import type { Result } from '@praha/byethrow';

import type { Schema, SchemaOutput } from '../core/types.ts';
import {
    type ResponseValidationError,
    createInvalidResponseSchemaError,
    createResponseSchemaExecutionError,
} from '../errors/responseValidationError.ts';

/** Validates decoded response data and returns the response schema output. */
export async function validateResponse<TSchema extends Schema>(
    schema: TSchema,
    value: unknown,
): Result.ResultAsync<SchemaOutput<TSchema>, ResponseValidationError> {
    try {
        const validation = await schema['~standard'].validate(value);
        if (validation.issues !== undefined) {
            return {
                type: 'Failure',
                error: createInvalidResponseSchemaError(validation.issues),
            };
        }

        return {
            type: 'Success',
            // Standard Schema guarantees this value is the schema's declared output.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            value: validation.value as SchemaOutput<TSchema>,
        };
    } catch (error) {
        return {
            type: 'Failure',
            error: createResponseSchemaExecutionError(error),
        };
    }
}
