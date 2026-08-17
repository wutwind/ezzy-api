import type { AnyEndpoint, ValidateApiDefinition } from './types.ts';

/**
 * Preserves endpoint and path literals while validating an API definition.
 */
export function defineApi<const T extends Record<string, AnyEndpoint>>(
    definition: T & ValidateApiDefinition<T>,
): T {
    return definition;
}
