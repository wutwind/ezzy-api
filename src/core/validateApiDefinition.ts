import { InvalidEndpointDefinitionError, InvalidEndpointPathError } from '../errors/apiDefinitionError.ts';
import type { AnyEndpoint } from './types.ts';

const HTTP_METHODS: ReadonlySet<unknown> = new Set([
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'HEAD',
    'OPTIONS',
]);

function validateEndpoint(name: string, endpoint: unknown): asserts endpoint is AnyEndpoint {
    if (typeof endpoint !== 'object' || endpoint === null) {
        throw new InvalidEndpointDefinitionError(name, 'endpoint');
    }
    if (!HTTP_METHODS.has(Reflect.get(endpoint, 'method'))) {
        throw new InvalidEndpointDefinitionError(name, 'method');
    }
    if (typeof Reflect.get(endpoint, 'path') !== 'string') {
        throw new InvalidEndpointDefinitionError(name, 'path');
    }
    const response = Reflect.get(endpoint, 'response');
    if (typeof response !== 'object' || response === null || !('~standard' in response)) {
        throw new InvalidEndpointDefinitionError(name, 'response schema');
    }
}

export function validateApiDefinition(definition: Record<string, AnyEndpoint>): void {
    for (const [name, endpoint] of Object.entries(definition)) {
        validateEndpoint(name, endpoint);
        if (endpoint.path.includes('?') || endpoint.path.includes('#')) {
            throw new InvalidEndpointPathError(name, endpoint.path);
        }
    }
}
