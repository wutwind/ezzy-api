import { Result } from '@praha/byethrow';

import { type BodyKind, isBodyKind } from '../core/bodyKinds.ts';
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
import { serializeMultipartBody } from './serializeMultipartBody.ts';
import {
    type SerializedMultipartStreamBody,
    serializeMultipartStreamBody,
} from './serializeMultipartStreamBody.ts';

export interface BuildRequestOptions {
    readonly baseUrl: string;
    readonly queryOptions?: QueryOptions;
    readonly signal?: AbortSignal;
    readonly headers: TransportHeaders;
    readonly rawBody?: unknown;
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

function buildUrl(
    endpoint: AnyEndpoint,
    request: Readonly<Record<string, unknown>>,
    options: BuildRequestOptions,
): Result.Result<string, RequestValidationError> {
    const path = buildValidatedPath(endpoint, request);
    if (Result.isFailure(path)) {
        return path;
    }

    const query = buildValidatedQuery(endpoint, request, options.queryOptions ?? {});
    return Result.isFailure(query)
        ? query
        : Result.succeed(appendQuery(joinUrl(options.baseUrl, path.value), query.value));
}

function addJsonBody(
    request: Readonly<Record<string, unknown>>,
    transportRequest: TransportRequest,
): Result.Result<TransportRequest, RequestValidationError> {
    const result = serializeJsonBody(request.body);
    if (Result.isFailure(result)) {
        return Result.fail(createRequestConstructionError('body', result.error));
    }

    return Result.succeed({
        ...transportRequest,
        body: result.value,
    });
}

function withMultipartStreamHeaders(
    headers: TransportHeaders,
    serialized: SerializedMultipartStreamBody,
): TransportHeaders {
    const next = Object.fromEntries(
        Object.entries(headers).filter(([name]) => name !== 'content-type' && name !== 'content-length'),
    );
    next['content-type'] = serialized.contentType;
    if (serialized.contentLength !== undefined) {
        next['content-length'] = String(serialized.contentLength);
    }
    return next;
}

function isReadableStreamBody(value: unknown): value is ReadableStream<Uint8Array> {
    return (
        typeof value === 'object' && value !== null && typeof Reflect.get(value, 'getReader') === 'function'
    );
}

function addMarkerBody(
    kind: BodyKind,
    rawBody: unknown,
    transportRequest: TransportRequest,
): Result.Result<TransportRequest, RequestValidationError> {
    if (kind.kind === 'multipart') {
        const result = serializeMultipartBody(rawBody);
        return Result.isFailure(result)
            ? Result.fail(createRequestConstructionError('body', result.error))
            : Result.succeed({ ...transportRequest, body: result.value });
    }

    if (kind.kind === 'multipart-stream') {
        const result = serializeMultipartStreamBody(rawBody);
        return Result.isFailure(result)
            ? Result.fail(createRequestConstructionError('body', result.error))
            : Result.succeed({
                  ...transportRequest,
                  headers: withMultipartStreamHeaders(transportRequest.headers, result.value),
                  body: result.value.stream,
              });
    }

    if (!isReadableStreamBody(rawBody)) {
        return Result.fail(
            createRequestConstructionError(
                'body',
                'expected a ReadableStream<Uint8Array> body; wrap buffered data in new Blob([bytes]).stream()',
            ),
        );
    }
    return Result.succeed({ ...transportRequest, body: rawBody });
}

function withSignal(signal: AbortSignal | undefined): OptionsBuilder<TransportRequest> {
    return (options) => {
        if (signal !== undefined) {
            options.signal = signal;
        }
    };
}

function buildTransportRequest(
    endpoint: AnyEndpoint,
    request: Readonly<Record<string, unknown>>,
    options: BuildRequestOptions,
): Result.Result<TransportRequest, RequestValidationError> {
    const url = buildUrl(endpoint, request, options);
    if (Result.isFailure(url)) {
        return url;
    }

    return Result.succeed(
        createOptions<TransportRequest>(
            { url: url.value, method: endpoint.method, headers: options.headers },
            withSignal(options.signal),
        ),
    );
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

    const transportRequest = buildTransportRequest(endpoint, requestRecord, options);
    if (Result.isFailure(transportRequest)) {
        return transportRequest;
    }

    const { body } = endpoint;
    if (body === undefined) {
        return Result.succeed(transportRequest.value);
    }
    if (isBodyKind(body)) {
        return addMarkerBody(body, options.rawBody, transportRequest.value);
    }
    return addJsonBody(requestRecord, transportRequest.value);
}
