import { Result } from '@praha/byethrow';

import {
    type MultipartStreamBodySerializationError,
    createMultipartStreamBodySerializationError,
} from './multipartStreamBodySerializationError.ts';

const textEncoder = new globalThis.TextEncoder();

export interface PreparedTextPart {
    readonly kind: 'text';
    readonly bytes: Uint8Array;
}

export interface PreparedFilePart {
    readonly kind: 'file';
    readonly header: Uint8Array;
    readonly stream: ReadableStream<Uint8Array>;
    readonly size: number | undefined;
}

export type PreparedPart = PreparedTextPart | PreparedFilePart;

export interface PreparedMultipartStream {
    readonly parts: readonly PreparedPart[];
    readonly closing: Uint8Array;
    readonly contentType: string;
    readonly contentLength: number | undefined;
}

interface FileFields {
    readonly stream: ReadableStream<Uint8Array>;
    readonly filename: string;
    readonly type: string;
    readonly size: unknown;
}

function invalid(cause: unknown): MultipartStreamBodySerializationError {
    return createMultipartStreamBodySerializationError('InvalidValue', cause);
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
    return (
        typeof value === 'object' && value !== null && typeof Reflect.get(value, 'getReader') === 'function'
    );
}

/** Quoted filenames are UTF-8. Only quotes and line breaks are percent-escaped, matching Fetch. */
function escapeQuoted(value: string): string {
    return value
        .replace(/\r\n|\n|\r/gu, '\r\n')
        .replaceAll('\n', '%0A')
        .replaceAll('\r', '%0D')
        .replaceAll('"', '%22');
}

function encode(value: string): Uint8Array {
    return textEncoder.encode(value);
}

function createBoundary(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    let hex = '';
    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return `----ezzyform${hex}`;
}

function disposition(name: string, filename?: string): string {
    const quotedName = escapeQuoted(name);
    return filename === undefined
        ? `Content-Disposition: form-data; name="${quotedName}"`
        : `Content-Disposition: form-data; name="${quotedName}"; filename="${escapeQuoted(filename)}"`;
}

function textPart(boundary: string, name: string, value: string): PreparedTextPart {
    const normalized = value.replace(/\r\n|\n|\r/gu, '\r\n');
    return {
        kind: 'text',
        bytes: encode(`--${boundary}\r\n${disposition(name)}\r\n\r\n${normalized}\r\n`),
    };
}

function fileHeader(boundary: string, label: string, type: string): Uint8Array {
    return encode(`--${boundary}\r\n${label}\r\nContent-Type: ${type}\r\n\r\n`);
}

function mediaType(type: string): Result.Result<string, MultipartStreamBodySerializationError> {
    const trimmed = type.trim();
    if (/[\0\r\n]/u.test(trimmed)) {
        return Result.fail(invalid(type));
    }
    return Result.succeed(trimmed.length === 0 ? 'application/octet-stream' : trimmed);
}

function fileSize(value: unknown): Result.Result<number | undefined, MultipartStreamBodySerializationError> {
    if (value === undefined) {
        return Result.succeed(undefined);
    }
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        return Result.fail(invalid(value));
    }
    return Result.succeed(value);
}

function scalarText(
    boundary: string,
    name: string,
    value: string | number | boolean,
): Result.Result<PreparedTextPart, MultipartStreamBodySerializationError> {
    if (typeof value === 'number' && !Number.isFinite(value)) {
        return Result.fail(invalid({ key: name, value }));
    }
    return Result.succeed(textPart(boundary, name, String(value)));
}

function readFileFields(
    name: string,
    value: object,
): Result.Result<FileFields, MultipartStreamBodySerializationError> {
    const stream: unknown = Reflect.get(value, 'stream');
    const filename: unknown = Reflect.get(value, 'filename');
    const type: unknown = Reflect.get(value, 'type');
    if (
        !isReadableStream(stream) ||
        stream.locked ||
        typeof filename !== 'string' ||
        typeof type !== 'string'
    ) {
        return Result.fail(invalid({ key: name, value }));
    }
    return Result.succeed({ stream, filename, type, size: Reflect.get(value, 'size') });
}

function filePart(
    boundary: string,
    name: string,
    fields: FileFields,
): Result.Result<PreparedFilePart, MultipartStreamBodySerializationError> {
    const type = mediaType(fields.type);
    if (Result.isFailure(type)) {
        return Result.fail(invalid({ key: name, value: fields.type }));
    }
    const size = fileSize(fields.size);
    if (Result.isFailure(size)) {
        return Result.fail(invalid({ key: name, value: fields.size }));
    }
    return Result.succeed({
        kind: 'file',
        header: fileHeader(boundary, disposition(name, fields.filename), type.value),
        stream: fields.stream,
        size: size.value,
    });
}

function prepareFile(
    boundary: string,
    name: string,
    value: object,
): Result.Result<PreparedFilePart, MultipartStreamBodySerializationError> {
    const fields = readFileFields(name, value);
    if (Result.isFailure(fields)) {
        return Result.fail(fields.error);
    }
    return filePart(boundary, name, fields.value);
}

function fieldName(field: object): string | undefined {
    const name: unknown = Reflect.get(field, 'name');
    return typeof name === 'string' ? name : undefined;
}

function prepareFieldValue(
    boundary: string,
    name: string,
    value: unknown,
): Result.Result<PreparedPart, MultipartStreamBodySerializationError> {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return scalarText(boundary, name, value);
    }
    if (typeof value === 'object' && value !== null) {
        return prepareFile(boundary, name, value);
    }
    return Result.fail(invalid({ key: name, value }));
}

function prepareField(
    boundary: string,
    field: unknown,
): Result.Result<PreparedPart, MultipartStreamBodySerializationError> {
    if (typeof field !== 'object' || field === null || Array.isArray(field)) {
        return Result.fail(invalid(field));
    }
    const name = fieldName(field);
    if (name === undefined) {
        return Result.fail(invalid(field));
    }
    return prepareFieldValue(boundary, name, Reflect.get(field, 'value'));
}

function registerStream(part: PreparedPart, streams: Set<ReadableStream<Uint8Array>>): boolean {
    if (part.kind !== 'file') {
        return true;
    }
    if (streams.has(part.stream)) {
        return false;
    }
    streams.add(part.stream);
    return true;
}

function prepareParts(
    fields: readonly unknown[],
    boundary: string,
): Result.Result<readonly PreparedPart[], MultipartStreamBodySerializationError> {
    const parts: PreparedPart[] = [];
    const streams = new Set<ReadableStream<Uint8Array>>();
    for (const field of fields) {
        const prepared = prepareField(boundary, field);
        if (Result.isFailure(prepared)) {
            return Result.fail(prepared.error);
        }
        if (!registerStream(prepared.value, streams)) {
            return Result.fail(invalid('each multipart file must use a distinct stream'));
        }
        parts.push(prepared.value);
    }
    return Result.succeed(parts);
}

function measuredPartLength(part: PreparedPart): number | undefined {
    if (part.kind === 'text') {
        return part.bytes.byteLength;
    }
    if (part.size === undefined) {
        return undefined;
    }
    return part.header.byteLength + part.size + 2;
}

function measuredLength(parts: readonly PreparedPart[], closing: Uint8Array): number | undefined {
    let total = closing.byteLength;
    for (const part of parts) {
        const partLength = measuredPartLength(part);
        if (partLength === undefined || !Number.isSafeInteger(total + partLength)) {
            return undefined;
        }
        total += partLength;
    }
    return total;
}

function fieldList(body: unknown): Result.Result<readonly unknown[], MultipartStreamBodySerializationError> {
    if (body == null) {
        return Result.fail(createMultipartStreamBodySerializationError('MissingBody'));
    }
    if (!Array.isArray(body)) {
        return Result.fail(invalid('expected an array of multipart fields'));
    }
    return Result.succeed(body);
}

export function prepareMultipartStream(
    body: unknown,
): Result.Result<PreparedMultipartStream, MultipartStreamBodySerializationError> {
    const fields = fieldList(body);
    if (Result.isFailure(fields)) {
        return Result.fail(fields.error);
    }
    const boundary = createBoundary();
    const parts = prepareParts(fields.value, boundary);
    if (Result.isFailure(parts)) {
        return Result.fail(parts.error);
    }
    const closing = encode(`--${boundary}--\r\n`);
    return Result.succeed({
        parts: parts.value,
        closing,
        contentType: `multipart/form-data; boundary=${boundary}`,
        contentLength: measuredLength(parts.value, closing),
    });
}
