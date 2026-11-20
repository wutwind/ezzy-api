export type MultipartBodySerializationReason = 'MissingBody' | 'InvalidValue';

export interface MultipartBodySerializationError {
    readonly type: 'MultipartBodySerializationError';
    readonly reason: MultipartBodySerializationReason;
    readonly cause?: unknown;
}

export function createMultipartBodySerializationError(
    reason: MultipartBodySerializationReason,
    cause?: unknown,
): MultipartBodySerializationError {
    return cause === undefined
        ? { type: 'MultipartBodySerializationError', reason }
        : { type: 'MultipartBodySerializationError', reason, cause };
}
