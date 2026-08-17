import { Result } from '@praha/byethrow';

import {
    type BuildPathError,
    createInvalidPathParameterError,
    createMissingPathParameterError,
    createUnexpectedPathParameterError,
} from './buildPath.errors.ts';

export type { BuildPathError } from './buildPath.errors.ts';

const PATH_PARAM_PATTERN = /:([^/]+)/gu;

export type PathValues = Readonly<Record<string, string>>;

/**
 * Replaces path parameters with URL-encoded values.
 *
 * The provided keys must exactly match the `:name` segments in the path.
 */
export function buildPath(path: string, params: PathValues): Result.Result<string, BuildPathError> {
    const paramNames = new Set(Array.from(path.matchAll(PATH_PARAM_PATTERN), (match) => match[1]));

    for (const paramName of paramNames) {
        if (!Object.hasOwn(params, paramName)) {
            return Result.fail(createMissingPathParameterError(paramName));
        }
    }

    for (const paramName of Object.keys(params)) {
        if (!paramNames.has(paramName)) {
            return Result.fail(createUnexpectedPathParameterError(paramName));
        }
    }

    let encodingError: BuildPathError | undefined;

    const result = path.replace(PATH_PARAM_PATTERN, (_match, paramName: string) => {
        const value = params[paramName];

        if (typeof value !== 'string') {
            encodingError = createInvalidPathParameterError(paramName, 'NotString');
            return '';
        }

        try {
            return encodeURIComponent(value);
        } catch {
            encodingError = createInvalidPathParameterError(paramName, 'InvalidEncoding');
            return '';
        }
    });

    return encodingError === undefined ? Result.succeed(result) : Result.fail(encodingError);
}
