export type InvalidQueryValueReason = 'UnsupportedType' | 'NonFiniteNumber' | 'InvalidEncoding';

export interface InvalidQueryValueError {
    readonly type: 'InvalidQueryValue';
    readonly key: string;
    readonly reason: InvalidQueryValueReason;
}

export interface InvalidQueryArrayFormatError {
    readonly type: 'InvalidQueryArrayFormat';
    readonly format: unknown;
}

export type SerializeQueryError = InvalidQueryValueError | InvalidQueryArrayFormatError;

export function createInvalidQueryValueError(
    key: string,
    reason: InvalidQueryValueReason,
): InvalidQueryValueError {
    return {
        type: 'InvalidQueryValue',
        key,
        reason,
    };
}

export function createInvalidQueryArrayFormatError(format: unknown): InvalidQueryArrayFormatError {
    return {
        type: 'InvalidQueryArrayFormat',
        format,
    };
}
