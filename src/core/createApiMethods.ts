import {
    createEndpointMethod,
    type RuntimeContext,
    type RuntimeEndpointMethod,
} from '../runtime/createEndpointMethod.ts';
import type { AnyEndpoint, ApiClient } from './types.ts';
import { validateApiDefinition } from './validateApiDefinition.ts';

export function createApiMethods<const TDefinition extends Record<string, AnyEndpoint>>(
    definition: TDefinition,
    context: RuntimeContext,
): ApiClient<TDefinition> {
    validateApiDefinition(definition);
    const methods = Object.create(null) as Record<string, RuntimeEndpointMethod>;
    for (const name of Object.keys(definition)) {
        methods[name] = createEndpointMethod(definition[name], context);
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return methods as ApiClient<TDefinition>;
}
