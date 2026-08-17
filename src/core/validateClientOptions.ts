import { Result } from '@praha/byethrow';

import {
    ConflictingTransportOptionsError,
    InvalidBaseUrlError,
    InvalidClientOptionError,
} from '../errors/clientConfigError.ts';
import { buildHeaders } from '../runtime/buildHeaders.ts';
import type { CreateApiClientOptions } from './types.ts';

function validateBaseUrl(baseUrl: unknown): asserts baseUrl is string {
    if (typeof baseUrl !== 'string' || baseUrl.includes('?') || baseUrl.includes('#')) {
        throw new InvalidBaseUrlError(baseUrl);
    }
}

function validateExtensions(options: CreateApiClientOptions): void {
    if (options.fetch !== undefined && typeof options.fetch !== 'function') {
        throw new InvalidClientOptionError('fetch');
    }
    const invalidTransport =
        options.transport !== undefined &&
        (typeof options.transport !== 'object' || typeof options.transport.request !== 'function');
    if (invalidTransport) {
        throw new InvalidClientOptionError('transport');
    }
    const invalidInterceptors =
        options.interceptors !== undefined &&
        (!Array.isArray(options.interceptors) ||
            !options.interceptors.every((interceptor) => typeof interceptor === 'function'));
    if (invalidInterceptors) {
        throw new InvalidClientOptionError('interceptors');
    }
}

function validateHeaders(options: CreateApiClientOptions): void {
    const headers = buildHeaders(false, options.headers);
    if (Result.isFailure(headers)) {
        throw new InvalidClientOptionError('headers', headers.error.cause);
    }
}

export function validateClientOptions(options: CreateApiClientOptions): void {
    if (options.fetch !== undefined && options.transport !== undefined) {
        throw new ConflictingTransportOptionsError();
    }
    validateBaseUrl(options.baseUrl);
    validateExtensions(options);
    validateHeaders(options);
}
