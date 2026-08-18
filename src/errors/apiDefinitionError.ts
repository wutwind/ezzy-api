/* oxlint-disable max-classes-per-file -- Variants belong to one public error family. */

export class InvalidEndpointPathError extends Error {
    readonly type = 'ApiDefinitionError';
    readonly reason = 'InvalidEndpointPath';
    readonly endpoint: string;
    readonly path: string;

    constructor(endpoint: string, path: string) {
        super(`Endpoint "${endpoint}" path must not contain a query string or fragment`);
        this.name = 'InvalidEndpointPathError';
        this.endpoint = endpoint;
        this.path = path;
    }
}

export class ApiDefinitionExecutionError extends Error {
    readonly type = 'ApiDefinitionError';
    readonly reason = 'DefinitionError';
    override readonly cause: unknown;

    constructor(cause: unknown) {
        super('Failed to read API definition', { cause });
        this.name = 'ApiDefinitionExecutionError';
        this.cause = cause;
    }
}

export class InvalidEndpointDefinitionError extends Error {
    readonly type = 'ApiDefinitionError';
    readonly reason = 'InvalidEndpoint';
    readonly endpoint: string;
    readonly field: string;

    constructor(endpoint: string, field: string) {
        super(`Endpoint "${endpoint}" has an invalid ${field}`);
        this.name = 'InvalidEndpointDefinitionError';
        this.endpoint = endpoint;
        this.field = field;
    }
}

export type ApiDefinitionError =
    | InvalidEndpointPathError
    | InvalidEndpointDefinitionError
    | ApiDefinitionExecutionError;
