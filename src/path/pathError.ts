export interface MissingPathParameterError {
    readonly type: 'MissingPathParameter';
    readonly parameter: string;
}

export interface UnexpectedPathParameterError {
    readonly type: 'UnexpectedPathParameter';
    readonly parameter: string;
}

export type InvalidPathParameterReason = 'NotString' | 'InvalidEncoding';

export interface InvalidPathParameterError {
    readonly type: 'InvalidPathParameter';
    readonly parameter: string;
    readonly reason: InvalidPathParameterReason;
}

export type BuildPathError =
    | MissingPathParameterError
    | UnexpectedPathParameterError
    | InvalidPathParameterError;

export function createMissingPathParameterError(parameter: string): MissingPathParameterError {
    return {
        type: 'MissingPathParameter',
        parameter,
    };
}

export function createUnexpectedPathParameterError(parameter: string): UnexpectedPathParameterError {
    return {
        type: 'UnexpectedPathParameter',
        parameter,
    };
}

export function createInvalidPathParameterError(
    parameter: string,
    reason: InvalidPathParameterReason,
): InvalidPathParameterError {
    return {
        type: 'InvalidPathParameter',
        parameter,
        reason,
    };
}
