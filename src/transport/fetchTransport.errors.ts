export interface TransportError {
    readonly type: 'TransportError';
    readonly cause: unknown;
}

export function createTransportError(cause: unknown): TransportError {
    return { type: 'TransportError', cause };
}
