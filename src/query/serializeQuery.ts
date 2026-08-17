import { Result } from '@praha/byethrow';

import type { QueryArrayFormat, QueryOptions } from '../core/types.ts';
import {
    type SerializeQueryError,
    createInvalidQueryArrayFormatError,
    createInvalidQueryValueError,
} from './serializeQuery.errors.ts';

export type { SerializeQueryError } from './serializeQuery.errors.ts';

export type QueryPrimitive = string | number | boolean;
export type QueryValue = QueryPrimitive | readonly QueryPrimitive[] | undefined;
export type QueryValues = Readonly<Record<string, QueryValue>>;
export type SerializeQueryOptions = QueryOptions;

type QueryArraySerializer = (encodedKey: string, encodedValues: readonly string[]) => string[];

const QUERY_ARRAY_SERIALIZERS = {
    repeat: (key, values): string[] => values.map((value) => `${key}=${value}`),
    brackets: (key, values): string[] => values.map((value) => `${key}[]=${value}`),
    comma: (key, values): string[] => (values.length === 0 ? [] : [`${key}=${values.join(',')}`]),
} satisfies Record<QueryArrayFormat, QueryArraySerializer>;

function isQueryPrimitive(value: unknown): value is QueryPrimitive {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isQueryArrayFormat(value: unknown): value is QueryArrayFormat {
    return value === 'repeat' || value === 'brackets' || value === 'comma';
}

function encodeQueryKey(key: string): Result.Result<string, SerializeQueryError> {
    try {
        return Result.succeed(encodeURIComponent(key));
    } catch {
        return Result.fail(createInvalidQueryValueError(key, 'InvalidEncoding'));
    }
}

function encodeQueryValue(key: string, value: unknown): Result.Result<string, SerializeQueryError> {
    if (!isQueryPrimitive(value)) {
        return Result.fail(createInvalidQueryValueError(key, 'UnsupportedType'));
    }

    if (typeof value === 'number' && !Number.isFinite(value)) {
        return Result.fail(createInvalidQueryValueError(key, 'NonFiniteNumber'));
    }

    try {
        return Result.succeed(encodeURIComponent(String(value)));
    } catch {
        return Result.fail(createInvalidQueryValueError(key, 'InvalidEncoding'));
    }
}

function encodeQueryValues(
    key: string,
    values: readonly unknown[],
): Result.Result<string[], SerializeQueryError> {
    const encodedValues: string[] = [];

    for (const value of values) {
        const encodedValue = encodeQueryValue(key, value);

        if (Result.isFailure(encodedValue)) {
            return encodedValue;
        }

        encodedValues.push(encodedValue.value);
    }

    return Result.succeed(encodedValues);
}

function formatQueryArray(
    encodedKey: string,
    encodedValues: readonly string[],
    arrayFormat: QueryArrayFormat,
): string[] {
    return QUERY_ARRAY_SERIALIZERS[arrayFormat](encodedKey, encodedValues);
}

function serializeQueryEntry(
    key: string,
    value: QueryValue,
    arrayFormat: QueryArrayFormat,
): Result.Result<string[], SerializeQueryError> {
    if (value === undefined) {
        return Result.succeed([]);
    }

    const encodedKey = encodeQueryKey(key);

    if (Result.isFailure(encodedKey)) {
        return encodedKey;
    }

    if (!Array.isArray(value)) {
        const encodedValue = encodeQueryValue(key, value);

        return Result.isFailure(encodedValue)
            ? encodedValue
            : Result.succeed([`${encodedKey.value}=${encodedValue.value}`]);
    }

    const encodedValues = encodeQueryValues(key, value);

    return Result.isFailure(encodedValues)
        ? encodedValues
        : Result.succeed(formatQueryArray(encodedKey.value, encodedValues.value, arrayFormat));
}

export function serializeQuery(
    query: QueryValues,
    options: SerializeQueryOptions = {},
): Result.Result<string, SerializeQueryError> {
    const { arrayFormat = 'repeat' } = options;

    if (!isQueryArrayFormat(arrayFormat)) {
        return Result.fail(createInvalidQueryArrayFormatError(arrayFormat));
    }

    const parts: string[] = [];

    for (const key of Object.keys(query)) {
        const serializedEntry = serializeQueryEntry(key, query[key], arrayFormat);

        if (Result.isFailure(serializedEntry)) {
            return serializedEntry;
        }

        parts.push(...serializedEntry.value);
    }

    return Result.succeed(parts.join('&'));
}
