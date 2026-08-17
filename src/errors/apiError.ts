import type { RequestValidationError } from '../schema/requestValidationError.ts';
import type { TransportError } from '../transport/transportError.ts';
import type { AbortError } from './abortError.ts';
import type { HttpError } from './httpError.ts';
import type { ResponseValidationError } from './responseValidationError.ts';

/** Expected failures returned by every generated endpoint method. */
export type ApiError =
    | RequestValidationError
    | AbortError
    | TransportError
    | HttpError
    | ResponseValidationError;
