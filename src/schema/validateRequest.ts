import { Result } from '@praha/byethrow';

import type { AnyEndpoint, Schema, SchemaOutput } from '../core/types.ts';
import {
    type RequestSection,
    type RequestValidationError,
    createRequestValidationError,
} from './requestValidation.errors.ts';

export type { RequestSection, RequestValidationError } from './requestValidation.errors.ts';

type SchemaOutputPart<Key extends PropertyKey, TSchema> = TSchema extends Schema
    ? { [K in Key]: SchemaOutput<TSchema> }
    : {};

export type ValidatedEndpointRequest<TEndpoint extends AnyEndpoint> = SchemaOutputPart<
    'params',
    TEndpoint['params']
> &
    SchemaOutputPart<'query', TEndpoint['query']> &
    SchemaOutputPart<'body', TEndpoint['body']>;

async function validateSection(
    section: RequestSection,
    schema: Schema,
    value: unknown,
): Result.ResultAsync<unknown, RequestValidationError> {
    try {
        const validation = await schema['~standard'].validate(value ?? {});
        return validation.issues === undefined
            ? Result.succeed(validation.value)
            : Result.fail(createRequestValidationError(section, validation.issues));
    } catch (error) {
        return Result.fail(
            createRequestValidationError(section, [{ message: 'Request schema validation failed' }], error),
        );
    }
}

function readSection(request: unknown, section: RequestSection): unknown {
    if (typeof request !== 'object' || request === null) {
        return undefined;
    }

    const descriptor = Object.getOwnPropertyDescriptor(request, section);
    return descriptor === undefined ? undefined : descriptor.value;
}

async function validateOptionalSection(
    section: RequestSection,
    schema: Schema | undefined,
    request: unknown,
): Result.ResultAsync<readonly [RequestSection, unknown] | undefined, RequestValidationError> {
    if (schema === undefined) {
        return { type: 'Success', value: undefined };
    }

    const result = await validateSection(section, schema, readSection(request, section));
    return Result.isFailure(result) ? result : Result.succeed([section, result.value] as const);
}

/** Validates every declared request section and returns schema outputs. */
export async function validateRequest<TEndpoint extends AnyEndpoint>(
    endpoint: TEndpoint,
    request: unknown = {},
): Result.ResultAsync<ValidatedEndpointRequest<TEndpoint>, RequestValidationError> {
    const results = await Promise.all([
        validateOptionalSection('params', endpoint.params, request),
        validateOptionalSection('query', endpoint.query, request),
        validateOptionalSection('body', endpoint.body, request),
    ]);
    const failure = results.find((result) => Result.isFailure(result));
    if (failure !== undefined && Result.isFailure(failure)) {
        return failure;
    }

    const validated = Object.fromEntries(
        results.flatMap((result) =>
            Result.isSuccess(result) && result.value !== undefined ? [result.value] : [],
        ),
    );

    return {
        type: 'Success',
        // The keys and values come directly from the endpoint's declared schemas.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        value: validated as ValidatedEndpointRequest<TEndpoint>,
    };
}
