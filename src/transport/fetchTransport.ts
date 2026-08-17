import { Result } from '@praha/byethrow';

import { type AbortError, createAbortError } from '../errors/abortError.ts';
import { type TransportError, createTransportError } from './transportError.ts';
import type { Transport, TransportHeaders, TransportRequest, TransportResponse } from './types.ts';

export type { TransportError } from './transportError.ts';

export type FetchImplementation = (input: string, init: RequestInit) => Promise<Response>;

function readHeaders(headers: Headers): TransportHeaders {
    const values: Record<string, string> = {};
    for (const [key, value] of headers) {
        values[key] = value;
    }
    return values;
}

async function toTransportResponse(response: Response): Promise<TransportResponse> {
    const body = await response.text();
    return {
        status: response.status,
        statusText: response.statusText,
        headers: readHeaders(response.headers),
        body,
    };
}

function buildRequestInit(input: TransportRequest): RequestInit {
    const init: RequestInit = {
        method: input.method,
        headers: input.headers,
    };

    if (input.body !== undefined) {
        init.body = input.body;
    }

    if (input.signal !== undefined) {
        init.signal = input.signal;
    }

    return init;
}

/** Creates the default transport backed by an injectable Fetch implementation. */
export function createFetchTransport(
    fetchImplementation: FetchImplementation = globalThis.fetch,
): Transport<TransportError | AbortError> {
    return {
        request: async (input) => {
            try {
                if (input.signal?.aborted === true) {
                    return Result.fail(createAbortError(input.signal.reason));
                }

                const response = await fetchImplementation(input.url, buildRequestInit(input));
                return Result.succeed(await toTransportResponse(response));
            } catch (error) {
                return Result.fail(
                    input.signal?.aborted === true
                        ? createAbortError(input.signal.reason)
                        : createTransportError(error),
                );
            }
        },
    };
}
