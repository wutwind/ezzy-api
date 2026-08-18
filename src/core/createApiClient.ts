import {
    ApiDefinitionExecutionError,
    InvalidEndpointDefinitionError,
    InvalidEndpointPathError,
} from '../errors/apiDefinitionError.ts';
import {
    ClientConfigExecutionError,
    ConflictingTransportOptionsError,
    InvalidBaseUrlError,
    InvalidClientOptionError,
} from '../errors/clientConfigError.ts';
import type { RuntimeContext } from '../runtime/createEndpointMethod.ts';
import { createFetchTransport } from '../transport/fetchTransport.ts';
import { applyTransportInterceptors } from '../transport/interceptors.ts';
import { createApiMethods } from './createApiMethods.ts';
import type {
    AnyEndpoint,
    ApiClient,
    ApiClientFactory,
    CreateApiClientOptions,
    ValidateApiDefinition,
} from './types.ts';
import { validateClientOptions } from './validateClientOptions.ts';

function createDefinition<const TDefinition extends Record<string, AnyEndpoint>>(
    definition: TDefinition,
    context: RuntimeContext,
): ApiClient<TDefinition> {
    try {
        return createApiMethods<TDefinition>(definition, context);
    } catch (error) {
        if (error instanceof InvalidEndpointPathError || error instanceof InvalidEndpointDefinitionError) {
            throw error;
        }
        throw new ApiDefinitionExecutionError(error);
    }
}

function createClientFactory(options: CreateApiClientOptions): ApiClientFactory {
    const baseTransport = options.transport ?? createFetchTransport(options.fetch);
    const context: RuntimeContext = {
        baseUrl: options.baseUrl,
        queryOptions: options.queryOptions ?? {},
        transport: applyTransportInterceptors(baseTransport, options.interceptors ?? []),
        headers: options.headers ?? {},
    };
    const create = <const TDefinition extends Record<string, AnyEndpoint>>(
        definition: TDefinition & ValidateApiDefinition<TDefinition>,
    ): ApiClient<TDefinition> => createDefinition<TDefinition>(definition, context);
    // The closure preserves the generic definition while sharing one runtime context.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return { create } as ApiClientFactory;
}

/** Creates a reusable client whose transport and defaults can back multiple API definitions. */
export function createApiClient(options: CreateApiClientOptions): ApiClientFactory {
    try {
        validateClientOptions(options);
        return createClientFactory(options);
    } catch (error) {
        const isClientConfigError =
            error instanceof ConflictingTransportOptionsError ||
            error instanceof InvalidBaseUrlError ||
            error instanceof InvalidClientOptionError;
        if (isClientConfigError) {
            throw error;
        }
        throw new ClientConfigExecutionError(error);
    }
}
