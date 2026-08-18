import { createApiClient } from './createApiClient.ts';
import type { AnyEndpoint, ApiClient, CreateApiOptions, ValidateApiDefinition } from './types.ts';

export { createApiClient } from './createApiClient.ts';
export type { ApiClientFactory, CreateApiClientOptions, CreateApiOptions } from './types.ts';
export type { ApiDefinitionError } from '../errors/apiDefinitionError.ts';
export type { ClientConfigError } from '../errors/clientConfigError.ts';
export {
    ApiDefinitionExecutionError,
    InvalidEndpointDefinitionError,
    InvalidEndpointPathError,
} from '../errors/apiDefinitionError.ts';
export {
    ClientConfigExecutionError,
    ConflictingTransportOptionsError,
    InvalidBaseUrlError,
    InvalidClientOptionError,
} from '../errors/clientConfigError.ts';

/** Creates a typed API backed by a dedicated client configuration. */
export function createApi<const TDefinition extends Record<string, AnyEndpoint>>(
    definition: TDefinition & ValidateApiDefinition<TDefinition>,
    options: CreateApiOptions,
): ApiClient<TDefinition> {
    return createApiClient(options).create<TDefinition>(definition);
}
