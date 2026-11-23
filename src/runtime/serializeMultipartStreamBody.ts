import { Result } from '@praha/byethrow';

import type { MultipartStreamBodySerializationError } from './multipartStreamBodySerializationError.ts';
import {
    type PreparedFilePart,
    type PreparedMultipartStream,
    type PreparedPart,
    prepareMultipartStream,
} from './prepareMultipartStream.ts';

export type {
    MultipartStreamBodySerializationError,
    MultipartStreamBodySerializationReason,
} from './multipartStreamBodySerializationError.ts';

const carriageReturnLineFeed = new Uint8Array([13, 10]);

interface StreamCursor {
    index: number;
    headerPending: boolean;
    sent: number;
    reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
}

interface PullContext {
    controller: ReadableStreamDefaultController<Uint8Array>;
    readonly parts: readonly PreparedPart[];
    readonly cursor: StreamCursor;
}

export interface SerializedMultipartStreamBody {
    readonly stream: ReadableStream<Uint8Array>;
    readonly contentType: string;
    readonly contentLength: number | undefined;
}

function partAt(parts: readonly PreparedPart[], index: number): PreparedPart | undefined {
    return index < parts.length ? parts[index] : undefined;
}

async function settle(operation: Promise<void>): Promise<void> {
    try {
        await operation;
    } catch {
        // The source stream has already settled.
    }
}

interface CancelRange {
    readonly parts: readonly PreparedPart[];
    readonly from: number;
    readonly active: PreparedPart | undefined;
    readonly reason: unknown;
}

function fileCancels(range: CancelRange): Promise<void>[] {
    const pending: Promise<void>[] = [];
    for (let index = range.from; index < range.parts.length; index += 1) {
        const part = partAt(range.parts, index);
        if (part?.kind === 'file' && part !== range.active) {
            pending.push(settle(part.stream.cancel(range.reason)));
        }
    }
    return pending;
}

async function cancelUnread(
    parts: readonly PreparedPart[],
    cursor: StreamCursor,
    reason: unknown,
): Promise<void> {
    const { reader } = cursor;
    const active = reader === undefined ? undefined : partAt(parts, cursor.index);
    cursor.reader = undefined;
    const pending: Promise<void>[] = [];
    if (reader !== undefined) {
        try {
            pending.push(settle(reader.cancel(reason)));
        } finally {
            // Cancel closes the stream synchronously, even when its underlying cleanup never settles.
            reader.releaseLock();
        }
    }
    pending.push(...fileCancels({ parts, from: cursor.index, active, reason }));
    await Promise.all(pending);
}

async function failPull(context: PullContext, reason: unknown): Promise<void> {
    context.controller.error(reason);
    // A source may never finish cancelling; it must not delay the original error.
    try {
        await cancelUnread(context.parts, context.cursor, reason);
    } catch {
        // Cleanup must not replace the source error.
    }
}

function openReader(cursor: StreamCursor, part: PreparedFilePart): unknown {
    if (cursor.reader !== undefined) {
        return undefined;
    }
    try {
        cursor.reader = part.stream.getReader();
        return undefined;
    } catch (error) {
        return error;
    }
}

async function readNext(
    cursor: StreamCursor,
): Promise<Result.Result<ReadableStreamReadResult<Uint8Array>, unknown>> {
    const { reader } = cursor;
    if (reader === undefined) {
        return Result.fail(new Error('Multipart file stream is not open'));
    }
    try {
        return Result.succeed(await reader.read());
    } catch (error) {
        return Result.fail(error);
    }
}

function releaseReader(cursor: StreamCursor): void {
    const { reader } = cursor;
    if (reader !== undefined) {
        reader.releaseLock();
    }
    cursor.reader = undefined;
}

function earlyEndError(part: PreparedFilePart, sent: number): Error | undefined {
    if (part.size === undefined || sent === part.size) {
        return undefined;
    }
    return new Error(
        `Multipart file stream ended after ${String(sent)} bytes; expected ${String(part.size)}`,
    );
}

function advancePastFile(context: PullContext): void {
    context.controller.enqueue(carriageReturnLineFeed);
    context.cursor.index += 1;
    context.cursor.headerPending = true;
    context.cursor.sent = 0;
}

async function finishFile(context: PullContext, part: PreparedFilePart): Promise<void> {
    releaseReader(context.cursor);
    const error = earlyEndError(part, context.cursor.sent);
    if (error !== undefined) {
        await failPull(context, error);
        return;
    }
    advancePastFile(context);
}

function acceptedBytes(part: PreparedFilePart, sent: number, value: unknown): Uint8Array | Error {
    if (!(value instanceof Uint8Array)) {
        return new TypeError('Multipart file stream must yield Uint8Array chunks');
    }
    if (part.size !== undefined && sent + value.byteLength > part.size) {
        return new Error(`Multipart file stream exceeded its declared size of ${String(part.size)} bytes`);
    }
    return value;
}

function enqueueBytes(context: PullContext, bytes: Uint8Array): void {
    if (bytes.byteLength === 0) {
        return;
    }
    context.controller.enqueue(bytes);
    context.cursor.sent += bytes.byteLength;
}

async function acceptChunk(context: PullContext, part: PreparedFilePart, value: unknown): Promise<void> {
    const bytes = acceptedBytes(part, context.cursor.sent, value);
    if (bytes instanceof Error) {
        await failPull(context, bytes);
        return;
    }
    enqueueBytes(context, bytes);
}

async function consumeChunk(
    context: PullContext,
    part: PreparedFilePart,
    next: ReadableStreamReadResult<Uint8Array>,
): Promise<void> {
    if (next.done) {
        await finishFile(context, part);
        return;
    }
    await acceptChunk(context, part, next.value);
}

async function readFileChunk(context: PullContext, part: PreparedFilePart): Promise<void> {
    const opened = openReader(context.cursor, part);
    if (opened !== undefined) {
        await failPull(context, opened);
        return;
    }
    const next = await readNext(context.cursor);
    if (Result.isFailure(next)) {
        await failPull(context, next.error);
        return;
    }
    await consumeChunk(context, part, next.value);
}

function enqueueText(context: PullContext, part: PreparedPart & { readonly kind: 'text' }): void {
    context.controller.enqueue(part.bytes);
    context.cursor.index += 1;
}

function enqueueFileHeader(context: PullContext, part: PreparedFilePart): void {
    context.controller.enqueue(part.header);
    context.cursor.headerPending = false;
}

async function pullExisting(context: PullContext, part: PreparedPart): Promise<void> {
    if (part.kind === 'text') {
        enqueueText(context, part);
        return;
    }
    if (context.cursor.headerPending) {
        enqueueFileHeader(context, part);
        return;
    }
    await readFileChunk(context, part);
}

async function pullPart(context: PullContext, closing: Uint8Array): Promise<void> {
    const part = partAt(context.parts, context.cursor.index);
    if (part === undefined) {
        context.controller.enqueue(closing);
        context.controller.close();
        return;
    }
    await pullExisting(context, part);
}

function createMultipartStream(prepared: PreparedMultipartStream): ReadableStream<Uint8Array> {
    const cursor: StreamCursor = { index: 0, headerPending: true, sent: 0, reader: undefined };
    return new globalThis.ReadableStream<Uint8Array>(
        {
            async pull(controller) {
                await pullPart({ controller, parts: prepared.parts, cursor }, prepared.closing);
            },
            async cancel(reason) {
                await cancelUnread(prepared.parts, cursor, reason);
            },
        },
        { highWaterMark: 1, size: () => 1 },
    );
}

/** Encodes multipart framing around caller-owned file streams without buffering those streams. */
export function serializeMultipartStreamBody(
    body: unknown,
): Result.Result<SerializedMultipartStreamBody, MultipartStreamBodySerializationError> {
    const prepared = prepareMultipartStream(body);
    if (Result.isFailure(prepared)) {
        return Result.fail(prepared.error);
    }
    return Result.succeed({
        stream: createMultipartStream(prepared.value),
        contentType: prepared.value.contentType,
        contentLength: prepared.value.contentLength,
    });
}
