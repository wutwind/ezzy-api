export interface AbortError {
    readonly type: 'AbortError';
    readonly reason: unknown;
}

export function createAbortError(reason: unknown): AbortError {
    return { type: 'AbortError', reason };
}
