import { Result } from '@praha/byethrow';

import type { AnyEndpoint, EndpointResponse, HeaderOptions, QueryOptions } from '../core/types.ts';
import type { ApiError } from '../errors/apiError.ts';
import { validateRequest } from '../schema/validateRequest.ts';
import { validateResponse } from '../schema/validateResponse.ts';
import type { TransportFailure } from '../transport/interceptors.ts';
import { createTransportError } from '../transport/transportError.ts';
import type { Transport, TransportHeaders, TransportResponse } from '../transport/types.ts';
import { buildHeaders } from './buildHeaders.ts';
import { buildRequest, type BuildRequestOptions } from './buildRequest.ts';
import { createOptions, type OptionsBuilder } from './createOptions.ts';
import { parseResponse } from './parseResponse.ts';

export type RuntimeEndpointMethod = (options?: unknown) => Result.ResultAsync<unknown, ApiError>;

export interface RuntimeContext {
    readonly baseUrl: string;
    readonly queryOptions: QueryOptions;
    readonly transport: Transport<TransportFailure>;
    readonly headers: HeaderOptions;
}

interface RuntimeCallOptions {
    readonly signal?: AbortSignal;
    readonly headers?: HeaderOptions;
}

async function handleResponse<TEndpoint extends AnyEndpoint>(
    endpoint: TEndpoint,
    response: TransportResponse,
): Result.ResultAsync<EndpointResponse<TEndpoint>, ApiError> {
    const parsed = parseResponse(response);
    return Result.isFailure(parsed)
        ? parsed
        : await validateResponse<TEndpoint['response']>(endpoint.response, parsed.value);
}

async function sendRequest<TEndpoint extends AnyEndpoint>(
    endpoint: TEndpoint,
    request: Parameters<Transport['request']>[0],
    transport: Transport<TransportFailure>,
): Result.ResultAsync<EndpointResponse<TEndpoint>, ApiError> {
    const response = await transport.request(request);
    return Result.isFailure(response) ? response : handleResponse(endpoint, response.value);
}

function withSignal<T extends { readonly signal?: AbortSignal }>(
    signal: AbortSignal | undefined,
): OptionsBuilder<T> {
    return (options) => {
        if (signal !== undefined) {
            options.signal = signal;
        }
    };
}

function withHeaders<T extends { readonly headers?: HeaderOptions }>(
    headers: HeaderOptions | undefined,
): OptionsBuilder<T> {
    return (options) => {
        if (headers !== undefined) {
            options.headers = headers;
        }
    };
}

function readCallOptions(options: unknown): RuntimeCallOptions {
    if (typeof options !== 'object' || options === null) {
        return {};
    }
    const signalValue: unknown = Object.getOwnPropertyDescriptor(options, 'signal')?.value;
    const headersValue: unknown = Object.getOwnPropertyDescriptor(options, 'headers')?.value;
    const signal =
        typeof signalValue === 'object' &&
        signalValue !== null &&
        'aborted' in signalValue &&
        'addEventListener' in signalValue
            ? (signalValue as AbortSignal)
            : undefined;
    const headers =
        typeof headersValue === 'object' && headersValue !== null
            ? (headersValue as HeaderOptions)
            : undefined;
    return createOptions<RuntimeCallOptions>({}, withSignal(signal), withHeaders(headers));
}

function buildOptions(
    context: RuntimeContext,
    call: RuntimeCallOptions,
    headers: TransportHeaders,
): BuildRequestOptions {
    return createOptions<BuildRequestOptions>(
        { baseUrl: context.baseUrl, queryOptions: context.queryOptions, headers },
        withSignal(call.signal),
    );
}

async function executeEndpoint<TEndpoint extends AnyEndpoint>(
    endpoint: TEndpoint,
    options: unknown,
    context: RuntimeContext,
): Result.ResultAsync<EndpointResponse<TEndpoint>, ApiError> {
    const validated = await validateRequest(endpoint, options);
    if (Result.isFailure(validated)) {
        return validated;
    }
    const callOptions = readCallOptions(options);
    const headers = buildHeaders(endpoint.body !== undefined, context.headers, callOptions.headers);
    if (Result.isFailure(headers)) {
        return headers;
    }
    const request = buildRequest(
        endpoint,
        validated.value,
        buildOptions(context, callOptions, headers.value),
    );
    return Result.isFailure(request) ? request : sendRequest(endpoint, request.value, context.transport);
}

export function createEndpointMethod(endpoint: AnyEndpoint, context: RuntimeContext): RuntimeEndpointMethod {
    return async (options = {}) => {
        try {
            return await executeEndpoint(endpoint, options, context);
        } catch (error) {
            return Result.fail(createTransportError(error));
        }
    };
}
