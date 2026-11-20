import { Result } from '@praha/byethrow';

import type { HeaderOptions } from '../core/types.ts';
import {
    type RequestValidationError,
    createRequestConstructionError,
} from '../schema/requestValidationError.ts';
import type { TransportHeaders } from '../transport/types.ts';

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
const INVALID_HEADER_VALUE = /[\0\r\n]/u;

/** Which body kind the headers are built for; drives the default content-type. */
export type RequestBodyKind = 'none' | 'json' | 'multipart' | 'stream';

interface InvalidHeaderCause {
    readonly name: string;
    readonly value: string | undefined;
}

function isValidHeader(name: string, value: string | undefined): boolean {
    if (!HEADER_NAME.test(name)) {
        return false;
    }
    return value == null || !INVALID_HEADER_VALUE.test(value);
}

function applyHeaders(
    target: Map<string, string>,
    source: HeaderOptions,
): Result.Result<void, InvalidHeaderCause> {
    for (const name of Object.keys(source)) {
        const value = source[name];
        if (!isValidHeader(name, value)) {
            return Result.fail({ name, value });
        }

        const normalizedName = name.toLowerCase();
        if (value === undefined) {
            target.delete(normalizedName);
        } else {
            target.set(normalizedName, value.trim());
        }
    }
    return Result.succeed(undefined);
}

export function buildHeaders(
    bodyKind: RequestBodyKind,
    ...layers: readonly (HeaderOptions | undefined)[]
): Result.Result<TransportHeaders, RequestValidationError> {
    try {
        // Kept separate so this public boundary only maps unexpected platform/proxy failures.
        // oxlint-disable-next-line no-use-before-define
        const result = resolveHeaders(bodyKind, layers);
        return Result.isFailure(result)
            ? Result.fail(createRequestConstructionError('headers', result.error))
            : result;
    } catch (error) {
        return Result.fail(createRequestConstructionError('headers', error));
    }
}

function resolveHeaders(
    bodyKind: RequestBodyKind,
    layers: readonly (HeaderOptions | undefined)[],
): Result.Result<TransportHeaders, InvalidHeaderCause> {
    const headers = new Map([['accept', 'application/json']]);
    if (bodyKind === 'json') {
        headers.set('content-type', 'application/json');
    }
    // Multipart and stream bodies carry no default content-type.
    // Fetch adds the multipart boundary, and a stream's media type cannot be inferred.
    for (const layer of layers) {
        if (layer != null) {
            const result = applyHeaders(headers, layer);
            if (Result.isFailure(result)) {
                return result;
            }
        }
    }
    return Result.succeed(Object.fromEntries(headers));
}
