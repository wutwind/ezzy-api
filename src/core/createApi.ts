import { Result } from '@praha/byethrow';

import type { ApiError } from '../errors/apiError.ts';
import { buildRequest } from '../runtime/buildRequest.ts';
import { parseResponse } from '../runtime/parseResponse.ts';
import { validateRequest } from '../schema/validateRequest.ts';
import { validateResponse } from '../schema/validateResponse.ts';
import { createFetchTransport, type FetchImplementation } from '../transport/fetchTransport.ts';
import {
    applyTransportInterceptors,
    type TransportFailure,
    type TransportInterceptor,
} from '../transport/interceptors.ts';
import type { Transport, TransportResponse } from '../transport/types.ts';
import type {
    AnyEndpoint,
    ApiClient,
    EndpointResponse,
    QueryOptions,
    ValidateApiDefinition,
} from './types.ts';

interface SharedApiClientOptions {
    readonly baseUrl: string;
    readonly queryOptions?: QueryOptions;
    readonly interceptors?: readonly TransportInterceptor[];
}

type ApiClientTransportOptions =
    | {
          readonly fetch?: FetchImplementation;
          readonly transport?: never;
      }
    | {
          readonly fetch?: never;
          readonly transport: Transport<TransportFailure>;
      };

export type CreateApiClientOptions = SharedApiClientOptions & ApiClientTransportOptions;

export type CreateApiOptions = CreateApiClientOptions;

export interface ApiClientFactory {
    readonly create: <const TDefinition extends Record<string, AnyEndpoint>>(
        definition: TDefinition & ValidateApiDefinition<TDefinition>,
    ) => ApiClient<TDefinition>;
}

type RuntimeEndpointMethod = (options?: unknown) => Result.ResultAsync<unknown, ApiError>;

interface RuntimeContext {
    readonly baseUrl: string;
    readonly queryOptions: QueryOptions;
    readonly transport: Transport<TransportFailure>;
}

async function handleResponse<TEndpoint extends AnyEndpoint>(
    endpoint: TEndpoint,
    response: TransportResponse,
): Result.ResultAsync<EndpointResponse<TEndpoint>, ApiError> {
    const parsed = parseResponse(response);
    if (Result.isFailure(parsed)) {
        return parsed;
    }

    return await validateResponse<TEndpoint['response']>(endpoint.response, parsed.value);
}

async function sendRequest<TEndpoint extends AnyEndpoint>(
    endpoint: TEndpoint,
    request: Parameters<Transport['request']>[0],
    transport: Transport<TransportFailure>,
): Result.ResultAsync<EndpointResponse<TEndpoint>, ApiError> {
    const response = await transport.request(request);
    return Result.isFailure(response) ? response : handleResponse(endpoint, response.value);
}

function readSignal(options: unknown): AbortSignal | undefined {
    if (typeof options !== 'object' || options === null) {
        return undefined;
    }

    const descriptor = Object.getOwnPropertyDescriptor(options, 'signal');
    const value: unknown = descriptor?.value;
    return typeof value === 'object' && value !== null && 'aborted' in value && 'addEventListener' in value
        ? (value as AbortSignal)
        : undefined;
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

    const signal = readSignal(options);
    const request = buildRequest(endpoint, validated.value, {
        baseUrl: context.baseUrl,
        queryOptions: context.queryOptions,
        ...(signal === undefined ? {} : { signal }),
    });
    return Result.isFailure(request) ? request : sendRequest(endpoint, request.value, context.transport);
}

function createEndpointMethod(endpoint: AnyEndpoint, context: RuntimeContext): RuntimeEndpointMethod {
    return async (options = {}) => {
        const result = await executeEndpoint(endpoint, options, context);
        return result;
    };
}

function assertValidBaseUrl(baseUrl: string): void {
    if (baseUrl.includes('?') || baseUrl.includes('#')) {
        throw new TypeError('baseUrl must not contain a query string or fragment');
    }
}

function assertValidEndpointPaths(definition: Record<string, AnyEndpoint>): void {
    for (const [name, endpoint] of Object.entries(definition)) {
        if (endpoint.path.includes('?') || endpoint.path.includes('#')) {
            throw new TypeError(`Endpoint "${name}" path must not contain a query string or fragment`);
        }
    }
}

function createApiMethods<const TDefinition extends Record<string, AnyEndpoint>>(
    definition: TDefinition,
    context: RuntimeContext,
): ApiClient<TDefinition> {
    assertValidEndpointPaths(definition);
    const methods = Object.create(null) as Record<string, RuntimeEndpointMethod>;

    for (const name of Object.keys(definition)) {
        methods[name] = createEndpointMethod(definition[name], context);
    }

    // Each definition entry is mapped to an endpoint method with the matching schema contract.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return methods as ApiClient<TDefinition>;
}

/** Creates a reusable client whose transport and defaults can back multiple API definitions. */
export function createApiClient(options: CreateApiClientOptions): ApiClientFactory {
    if (options.fetch !== undefined && options.transport !== undefined) {
        throw new TypeError('createApiClient accepts either fetch or transport, not both');
    }

    assertValidBaseUrl(options.baseUrl);

    const baseTransport = options.transport ?? createFetchTransport(options.fetch);
    const transport = applyTransportInterceptors(baseTransport, options.interceptors ?? []);
    const context = { baseUrl: options.baseUrl, queryOptions: options.queryOptions ?? {}, transport };

    function create<const TDefinition extends Record<string, AnyEndpoint>>(
        definition: TDefinition & ValidateApiDefinition<TDefinition>,
    ): ApiClient<TDefinition> {
        return createApiMethods<TDefinition>(definition, context);
    }

    // The closure preserves the generic definition while sharing one runtime context.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return { create } as ApiClientFactory;
}

/**
 * Creates typed endpoint methods backed by the configured Fetch implementation.
 *
 * The definition is validated exactly as in defineApi, so a definition passed
 * inline cannot bypass the compile-time endpoint checks.
 */
export function createApi<const TDefinition extends Record<string, AnyEndpoint>>(
    definition: TDefinition & ValidateApiDefinition<TDefinition>,
    options: CreateApiOptions,
): ApiClient<TDefinition> {
    return createApiClient(options).create<TDefinition>(definition);
}
