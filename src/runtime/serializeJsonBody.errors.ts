export type JsonBodySerializationReason = 'UnsupportedValue' | 'SerializationFailed';

export interface JsonBodySerializationError {
    readonly type: 'JsonBodySerializationError';
    readonly reason: JsonBodySerializationReason;
    readonly cause?: unknown;
}

export function createJsonBodySerializationError(
    reason: JsonBodySerializationReason,
    cause?: unknown,
): JsonBodySerializationError {
    return cause === undefined
        ? { type: 'JsonBodySerializationError', reason }
        : { type: 'JsonBodySerializationError', reason, cause };
}
