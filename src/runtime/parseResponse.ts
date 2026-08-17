import { Result } from '@praha/byethrow';

import { type HttpError, createHttpError } from '../errors/httpError.ts';
import {
    type ResponseValidationError,
    createInvalidJsonResponseError,
} from '../errors/responseValidationError.ts';
import type { TransportResponse } from '../transport/types.ts';

export type ParseResponseError = HttpError | ResponseValidationError;

function isSuccessfulStatus(status: number): boolean {
    return status >= 200 && status < 300;
}

/** Checks the HTTP status and decodes a successful JSON response. */
export function parseResponse(response: TransportResponse): Result.Result<unknown, ParseResponseError> {
    if (!isSuccessfulStatus(response.status)) {
        return Result.fail(createHttpError(response.status, response.statusText, response.body));
    }

    if (response.body.length === 0) {
        return Result.succeed(undefined);
    }

    try {
        return Result.succeed(JSON.parse(response.body));
    } catch (error) {
        return Result.fail(createInvalidJsonResponseError(error));
    }
}
