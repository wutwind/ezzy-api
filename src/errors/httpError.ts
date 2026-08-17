export interface HttpError {
    readonly type: 'HttpError';
    readonly status: number;
    readonly statusText: string;
    readonly body: string;
}

export function createHttpError(status: number, statusText: string, body: string): HttpError {
    return { type: 'HttpError', status, statusText, body };
}
