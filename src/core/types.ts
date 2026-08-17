import type { Result } from '@praha/byethrow';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import type { ApiError } from '../errors/apiError.ts';

export type Schema = StandardSchemaV1;

export type SchemaInput<TSchema> = TSchema extends Schema ? StandardSchemaV1.InferInput<TSchema> : never;

export type SchemaOutput<TSchema> = TSchema extends Schema ? StandardSchemaV1.InferOutput<TSchema> : never;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type QueryArrayFormat = 'repeat' | 'brackets' | 'comma';

export interface QueryOptions {
    readonly arrayFormat?: QueryArrayFormat;
}

export interface CallOptions {
    readonly signal?: AbortSignal;
}

/**
 * Extract :param names from:
 *   /courses/:id
 *   /courses/:courseId/lessons/:lessonId
 */
export type PathParamNames<TPath extends string> = TPath extends `${string}:${infer Param}/${infer Rest}`
    ? Param | PathParamNames<`/${Rest}`>
    : TPath extends `${string}:${infer Param}`
      ? Param
      : never;

export type PathParams<TPath extends string> = [PathParamNames<TPath>] extends [never]
    ? never
    : Record<PathParamNames<TPath>, string>;

type SameKeys<TLeft, TRight> =
    Exclude<keyof TLeft, keyof TRight> extends never
        ? Exclude<keyof TRight, keyof TLeft> extends never
            ? true
            : false
        : false;

type ValidPathParamsSchema<TPath extends string, TSchema extends Schema> =
    SameKeys<SchemaInput<TSchema>, PathParams<TPath>> extends true
        ? SameKeys<SchemaOutput<TSchema>, PathParams<TPath>> extends true
            ? SchemaOutput<TSchema> extends PathParams<TPath>
                ? TSchema
                : never
            : never
        : never;

/**
 * Requires a params schema with exactly the path parameter keys,
 * and rejects params schemas for paths without parameters.
 */
type ValidParamsSchema<TPath extends string, TSchema extends Schema | undefined> = [
    PathParamNames<TPath>,
] extends [never]
    ? TSchema extends undefined
        ? undefined
        : never
    : TSchema extends Schema
      ? ValidPathParamsSchema<TPath, TSchema>
      : undefined;

export interface EndpointDefinition<
    TPath extends string,
    TParams extends Schema | undefined = undefined,
    TQuery extends Schema | undefined = undefined,
    TBody extends Schema | undefined = undefined,
    TResponse extends Schema = Schema,
> {
    method: HttpMethod;
    path: TPath;

    params?: ValidParamsSchema<TPath, TParams>;
    query?: TQuery;
    queryOptions?: TQuery extends Schema ? QueryOptions : never;
    body?: TBody;

    /** Response schema is mandatory. */
    response: TResponse;
}

/**
 * Structural constraint used by defineApi.
 *
 * Important: this must NOT be EndpointDefinition<string, ...>.
 * Doing that widens the path to `string` and makes params validation
 * collapse to `undefined`.
 */
export interface AnyEndpoint {
    method: HttpMethod;
    path: string;
    params?: Schema;
    query?: Schema;
    queryOptions?: QueryOptions;
    body?: Schema;
    response: Schema;
}

type ValidateQueryOptions<TEndpoint> = TEndpoint extends { queryOptions: unknown }
    ? TEndpoint extends { query: Schema; queryOptions: QueryOptions }
        ? TEndpoint
        : never
    : TEndpoint;

type ValidateEndpoint<TEndpoint> = TEndpoint extends {
    method: infer Method;
    path: infer Path;
    response: infer Response;
}
    ? Method extends HttpMethod
        ? Path extends string
            ? Response extends Schema
                ? TEndpoint extends {
                      params: infer Params;
                  }
                    ? Params extends Schema
                        ? ValidParamsSchema<Path, Params> extends never
                            ? never
                            : ValidateQueryOptions<TEndpoint>
                        : never
                    : [PathParamNames<Path>] extends [never]
                      ? ValidateQueryOptions<TEndpoint>
                      : never
                : never
            : never
        : never
    : never;

export type ValidateApiDefinition<T extends Record<string, AnyEndpoint>> = {
    [K in keyof T]: ValidateEndpoint<T[K]> extends never ? never : T[K];
};

type RequestPart<Key extends PropertyKey, Value> = [Value] extends [never]
    ? {}
    : {} extends Value
      ? { [K in Key]?: Value }
      : { [K in Key]: Value };

export type EndpointRequest<TEndpoint extends AnyEndpoint> = RequestPart<
    'params',
    TEndpoint['params'] extends Schema ? SchemaInput<TEndpoint['params']> : PathParams<TEndpoint['path']>
> &
    RequestPart<'query', TEndpoint['query'] extends Schema ? SchemaInput<TEndpoint['query']> : never> &
    RequestPart<'body', TEndpoint['body'] extends Schema ? SchemaInput<TEndpoint['body']> : never> &
    CallOptions;

export type EndpointResponse<TEndpoint extends AnyEndpoint> = SchemaOutput<TEndpoint['response']>;

type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

type HasRequiredOptions<TEndpoint extends AnyEndpoint> = [RequiredKeys<EndpointRequest<TEndpoint>>] extends [
    never,
]
    ? false
    : true;

export type EndpointMethod<TEndpoint extends AnyEndpoint> =
    HasRequiredOptions<TEndpoint> extends true
        ? (options: EndpointRequest<TEndpoint>) => Result.ResultAsync<EndpointResponse<TEndpoint>, ApiError>
        : (options?: EndpointRequest<TEndpoint>) => Result.ResultAsync<EndpointResponse<TEndpoint>, ApiError>;

export type ApiClient<TDefinition extends Record<string, AnyEndpoint>> = {
    [K in keyof TDefinition]: EndpointMethod<TDefinition[K]>;
};
