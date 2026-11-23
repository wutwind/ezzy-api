import { Result } from '@praha/byethrow';

import { type HttpError, createHttpError } from '../errors/httpError.ts';
import {
    type ResponseValidationError,
    createInvalidJsonResponseError,
} from '../errors/responseValidationError.ts';
import type { TransportResponse } from '../transport/types.ts';
import { safeJsonParse } from './safeJson.ts';

export type ParseResponseError = HttpError | ResponseValidationError;

function isSuccessfulStatus(status: number): boolean {
    return status >= 200 && status < 300;
}

export function parseResponse(response: TransportResponse): Result.Result<unknown, ParseResponseError> {
    if (!isSuccessfulStatus(response.status)) {
        return Result.fail(createHttpError(response.status, response.statusText, response.body));
    }

    if (response.body.length === 0) {
        return Result.succeed(undefined);
    }

    const parsed = safeJsonParse(response.body);
    return Result.isFailure(parsed) ? Result.fail(createInvalidJsonResponseError(parsed.error)) : parsed;
}
