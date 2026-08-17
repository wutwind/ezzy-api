/* oxlint-disable max-classes-per-file -- Variants belong to one public error family. */

export class ConflictingTransportOptionsError extends Error {
    readonly type = 'ClientConfigError';
    readonly reason = 'ConflictingTransportOptions';

    constructor() {
        super('createApiClient accepts either fetch or transport, not both');
        this.name = 'ConflictingTransportOptionsError';
    }
}

export class InvalidBaseUrlError extends Error {
    readonly type = 'ClientConfigError';
    readonly reason = 'InvalidBaseUrl';
    readonly baseUrl: unknown;

    constructor(baseUrl: unknown) {
        super('baseUrl must not contain a query string or fragment');
        this.name = 'InvalidBaseUrlError';
        this.baseUrl = baseUrl;
    }
}

export class ClientConfigExecutionError extends Error {
    readonly type = 'ClientConfigError';
    readonly reason = 'ConfigurationError';
    override readonly cause: unknown;

    constructor(cause: unknown) {
        super('Failed to read client configuration', { cause });
        this.name = 'ClientConfigExecutionError';
        this.cause = cause;
    }
}

export class InvalidClientOptionError extends Error {
    readonly type = 'ClientConfigError';
    readonly reason = 'InvalidOption';
    readonly option: string;
    override readonly cause: unknown;

    constructor(option: string, cause?: unknown) {
        super(`Invalid createApiClient option: ${option}`, { cause });
        this.name = 'InvalidClientOptionError';
        this.option = option;
        this.cause = cause;
    }
}

export type ClientConfigError =
    | ConflictingTransportOptionsError
    | InvalidBaseUrlError
    | InvalidClientOptionError
    | ClientConfigExecutionError;
