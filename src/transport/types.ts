import type { Result } from '@praha/byethrow';

import type { HttpMethod } from '../core/types.ts';

export type TransportHeaders = Readonly<Record<string, string>>;

export interface TransportRequest {
    readonly url: string;
    readonly method: HttpMethod;
    readonly headers: TransportHeaders;
    readonly body?: string;
    readonly signal?: AbortSignal;
}

export interface TransportResponse {
    readonly status: number;
    readonly statusText: string;
    readonly headers: TransportHeaders;
    readonly body: string;
}

/** Internal HTTP boundary. Implementations convert I/O failures into their error type. */
export interface Transport<TError = unknown> {
    readonly request: (input: TransportRequest) => Result.ResultAsync<TransportResponse, TError>;
}
