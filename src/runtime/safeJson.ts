import { Result } from '@praha/byethrow';

const parseJson: (text: string) => unknown = JSON.parse;
const stringifyJson: (value: unknown) => string | undefined = JSON.stringify;

export function safeJsonParse(text: string): Result.Result<unknown, unknown> {
    return Result.try({ try: () => parseJson(text), catch: (error) => error });
}

export function safeJsonStringify(value: unknown): Result.Result<string | undefined, unknown> {
    return Result.try({ try: () => stringifyJson(value), catch: (error) => error });
}
