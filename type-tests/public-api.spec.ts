import {
    createApi,
    createApiClient,
    defineApi,
    type ApiClient,
    type ApiClientFactory,
    type ApiDefinitionError,
    type ApiError,
    type ClientConfigError,
    type CreateApiClientOptions,
    type CreateApiOptions,
    type QueryOptions,
    type Transport,
    type TransportFailure,
    type TransportRequest,
    type TransportResponse,
    type TransportInterceptor,
} from '../src/index.ts';
// @ts-expect-error path construction is an internal runtime detail
import { buildPath } from '../src/index.ts';
// @ts-expect-error query serialization is an internal runtime detail
import { serializeQuery } from '../src/index.ts';
// @ts-expect-error request validation is an internal runtime detail
import { validateRequest } from '../src/index.ts';

createApi satisfies Function;
createApiClient satisfies Function;
defineApi satisfies Function;

declare const customTransport: Transport<TransportFailure>;
// @ts-expect-error a client accepts either fetch or a custom transport, not both
createApiClient({ baseUrl: '/api', fetch: globalThis.fetch, transport: customTransport });

type PublicTypes =
    | ApiClient<never>
    | ApiClientFactory
    | ApiDefinitionError
    | ApiError
    | ClientConfigError
    | CreateApiClientOptions
    | CreateApiOptions
    | QueryOptions
    | Transport
    | TransportInterceptor;
declare const publicType: PublicTypes;
void publicType;
void buildPath;
void serializeQuery;
void validateRequest;

const client = createApiClient({ baseUrl: '/api' });
client satisfies ApiClientFactory;

declare const error: ApiError;
if (error.type === 'RequestValidationError') {
    error.section satisfies 'params' | 'query' | 'body' | 'headers';
} else if (error.type === 'TransportError') {
    error.cause satisfies unknown;
} else if (error.type === 'AbortError') {
    error.reason satisfies unknown;
} else if (error.type === 'HttpError') {
    error.status satisfies number;
} else {
    error.type satisfies 'ResponseValidationError';
}

interface TestTransportError {
    readonly type: 'TestTransportError';
}

const request = {
    url: '/api/courses',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"name":"TypeScript"}',
} satisfies TransportRequest;
request.method satisfies 'POST';

const response: TransportResponse = {
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '{}',
};
const transport: Transport<TestTransportError> = {
    request: () => Promise.resolve({ type: 'Success', value: response }),
};
transport.request(request);

const invalidRequest: TransportRequest = {
    url: '/api/courses',
    // @ts-expect-error transport methods are restricted to supported HTTP methods
    method: 'TRACE',
    headers: {},
};
void invalidRequest;
