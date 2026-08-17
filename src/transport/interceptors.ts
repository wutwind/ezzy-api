import { Result } from '@praha/byethrow';

import type { AbortError } from '../errors/abortError.ts';
import { createTransportError, type TransportError } from './fetchTransport.errors.ts';
import type { Transport, TransportRequest, TransportResponse } from './types.ts';

export type TransportFailure = TransportError | AbortError;

export type TransportNext = (
    request: TransportRequest,
) => Result.ResultAsync<TransportResponse, TransportFailure>;

export type TransportInterceptor = (
    request: TransportRequest,
    next: TransportNext,
) => Result.ResultAsync<TransportResponse, TransportFailure>;

/** Wraps a transport in request/response interceptors in declaration order. */
export function applyTransportInterceptors(
    transport: Transport<TransportFailure>,
    interceptors: readonly TransportInterceptor[],
): Transport<TransportFailure> {
    const dispatch = async (
        index: number,
        request: TransportRequest,
    ): Result.ResultAsync<TransportResponse, TransportFailure> => {
        const interceptor = interceptors[index];

        try {
            return interceptor === undefined
                ? await transport.request(request)
                : await interceptor(request, (nextRequest) => dispatch(index + 1, nextRequest));
        } catch (error) {
            return Result.fail(createTransportError(error));
        }
    };

    return {
        request: (request) => dispatch(0, request),
    };
}
