import { Result } from '@praha/byethrow';

import type { AnyEndpoint, QueryOptions } from '../core/types.ts';
import { buildPath, type PathValues } from '../path/buildPath.ts';
import { serializeQuery, type QueryValues } from '../query/serializeQuery.ts';
import {
    type RequestValidationError,
    createRequestConstructionError,
} from '../schema/requestValidationError.ts';
import type { ValidatedEndpointRequest } from '../schema/validateRequest.ts';
import type { TransportHeaders, TransportRequest } from '../transport/types.ts';
import { createOptions, type OptionsBuilder } from './createOptions.ts';
import { serializeJsonBody } from './serializeJsonBody.ts';

export interface BuildRequestOptions {
    readonly baseUrl: string;
    readonly queryOptions?: QueryOptions;
    readonly signal?: AbortSignal;
    readonly headers: TransportHeaders;
}

function joinUrl(baseUrl: string, path: string): string {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
}

function appendQuery(url: string, query: string): string {
    return query.length === 0 ? url : `${url}?${query}`;
}

function buildValidatedPath(
    endpoint: AnyEndpoint,
    request: Readonly<Record<string, unknown>>,
): Result.Result<string, RequestValidationError> {
    // Request schemas are required to produce the named path parameter record.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const params = (request.params ?? {}) as PathValues;
    const result = buildPath(endpoint.path, params);

    return Result.isFailure(result)
        ? Result.fail(createRequestConstructionError('params', result.error))
        : result;
}

function buildValidatedQuery(
    endpoint: AnyEndpoint,
    request: Readonly<Record<string, unknown>>,
    queryOptions: QueryOptions,
): Result.Result<string, RequestValidationError> {
    if (endpoint.query === undefined) {
        return Result.succeed('');
    }

    // Unsupported schema outputs are rejected by serializeQuery at runtime.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const result = serializeQuery(request.query as QueryValues, endpoint.queryOptions ?? queryOptions);
    return Result.isFailure(result)
        ? Result.fail(createRequestConstructionError('query', result.error))
        : result;
}

function addValidatedBody(
    endpoint: AnyEndpoint,
    request: Readonly<Record<string, unknown>>,
    transportRequest: TransportRequest,
): Result.Result<TransportRequest, RequestValidationError> {
    if (endpoint.body === undefined) {
        return Result.succeed(transportRequest);
    }

    const result = serializeJsonBody(request.body);
    if (Result.isFailure(result)) {
        return Result.fail(createRequestConstructionError('body', result.error));
    }

    return Result.succeed({
        ...transportRequest,
        body: result.value,
    });
}

function withSignal(signal: AbortSignal | undefined): OptionsBuilder<TransportRequest> {
    return (options) => {
        if (signal !== undefined) {
            options.signal = signal;
        }
    };
}

/** Builds the internal transport request from schema-validated request outputs. */
export function buildRequest<TEndpoint extends AnyEndpoint>(
    endpoint: TEndpoint,
    request: ValidatedEndpointRequest<TEndpoint>,
    options: BuildRequestOptions,
): Result.Result<TransportRequest, RequestValidationError> {
    // ValidatedEndpointRequest is a schema-derived record of request sections.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const requestRecord = request as Readonly<Record<string, unknown>>;
    const path = buildValidatedPath(endpoint, requestRecord);
    if (Result.isFailure(path)) {
        return path;
    }

    const query = buildValidatedQuery(endpoint, requestRecord, options.queryOptions ?? {});
    if (Result.isFailure(query)) {
        return query;
    }

    const url = appendQuery(joinUrl(options.baseUrl, path.value), query.value);
    const transportRequest = createOptions<TransportRequest>(
        { url, method: endpoint.method, headers: options.headers },
        withSignal(options.signal),
    );
    return addValidatedBody(endpoint, requestRecord, transportRequest);
}
