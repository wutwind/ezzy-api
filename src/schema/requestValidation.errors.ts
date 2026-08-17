import type { StandardSchemaV1 } from '@standard-schema/spec';

export type RequestSection = 'params' | 'query' | 'body';

export interface RequestValidationError {
    readonly type: 'RequestValidationError';
    readonly section: RequestSection;
    readonly issues: readonly StandardSchemaV1.Issue[];
    readonly cause?: unknown;
}

export function createRequestValidationError(
    section: RequestSection,
    issues: readonly StandardSchemaV1.Issue[],
    cause?: unknown,
): RequestValidationError {
    return cause === undefined
        ? { type: 'RequestValidationError', section, issues }
        : { type: 'RequestValidationError', section, issues, cause };
}

export function createRequestConstructionError(
    section: RequestSection,
    cause: unknown,
): RequestValidationError {
    return createRequestValidationError(
        section,
        [{ message: `Failed to serialize request ${section}` }],
        cause,
    );
}
