import type { StandardSchemaV1 } from '@standard-schema/spec';

export interface InvalidJsonResponseError {
    readonly type: 'ResponseValidationError';
    readonly reason: 'InvalidJson';
    readonly cause: unknown;
}

export interface InvalidResponseSchemaError {
    readonly type: 'ResponseValidationError';
    readonly reason: 'SchemaValidation';
    readonly issues: readonly StandardSchemaV1.Issue[];
}

export interface ResponseSchemaExecutionError {
    readonly type: 'ResponseValidationError';
    readonly reason: 'SchemaError';
    readonly cause: unknown;
}

export type ResponseValidationError =
    | InvalidJsonResponseError
    | InvalidResponseSchemaError
    | ResponseSchemaExecutionError;

export function createInvalidJsonResponseError(cause: unknown): InvalidJsonResponseError {
    return { type: 'ResponseValidationError', reason: 'InvalidJson', cause };
}

export function createInvalidResponseSchemaError(
    issues: readonly StandardSchemaV1.Issue[],
): InvalidResponseSchemaError {
    return { type: 'ResponseValidationError', reason: 'SchemaValidation', issues };
}

export function createResponseSchemaExecutionError(cause: unknown): ResponseSchemaExecutionError {
    return { type: 'ResponseValidationError', reason: 'SchemaError', cause };
}
