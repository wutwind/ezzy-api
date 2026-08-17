import {
    createApi,
    createApiClient,
    defineApi,
    type ApiClient,
    type ApiClientFactory,
    type ApiError,
    type CreateApiClientOptions,
    type CreateApiOptions,
    type QueryOptions,
    type Transport,
    type TransportFailure,
    type TransportInterceptor,
} from './index.ts';
// @ts-expect-error path construction is an internal runtime detail
import { buildPath } from './index.ts';
// @ts-expect-error query serialization is an internal runtime detail
import { serializeQuery } from './index.ts';
// @ts-expect-error request validation is an internal runtime detail
import { validateRequest } from './index.ts';

createApi satisfies Function;
createApiClient satisfies Function;
defineApi satisfies Function;

declare const customTransport: Transport<TransportFailure>;
// @ts-expect-error a client accepts either fetch or a custom transport, not both
createApiClient({ baseUrl: '/api', fetch: globalThis.fetch, transport: customTransport });

type PublicTypes =
    | ApiClient<never>
    | ApiClientFactory
    | ApiError
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
