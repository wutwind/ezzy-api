import type { ApiError } from './apiError.ts';

declare const error: ApiError;

if (error.type === 'RequestValidationError') {
    error.section satisfies 'params' | 'query' | 'body';
} else if (error.type === 'TransportError') {
    error.cause satisfies unknown;
} else if (error.type === 'AbortError') {
    error.reason satisfies unknown;
} else if (error.type === 'HttpError') {
    error.status satisfies number;
} else {
    error.type satisfies 'ResponseValidationError';
}

// @ts-expect-error ApiError is a closed discriminated union
error.type satisfies 'UnknownError';
