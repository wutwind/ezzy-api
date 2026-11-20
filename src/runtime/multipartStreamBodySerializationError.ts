export type MultipartStreamBodySerializationReason = 'MissingBody' | 'InvalidValue';

export interface MultipartStreamBodySerializationError {
    readonly type: 'MultipartStreamBodySerializationError';
    readonly reason: MultipartStreamBodySerializationReason;
    readonly cause?: unknown;
}

export function createMultipartStreamBodySerializationError(
    reason: MultipartStreamBodySerializationReason,
    cause?: unknown,
): MultipartStreamBodySerializationError {
    return cause === undefined
        ? { type: 'MultipartStreamBodySerializationError', reason }
        : { type: 'MultipartStreamBodySerializationError', reason, cause };
}
