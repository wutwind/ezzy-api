import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '@praha/byethrow';

import { serializeMultipartStreamBody } from './serializeMultipartStreamBody.ts';

const textEncoder = new TextEncoder();

function fileStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            if (bytes.byteLength > 0) {
                controller.enqueue(bytes);
            }
            controller.close();
        },
    });
}

async function readBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
        const next = await reader.read();
        if (next.done) {
            break;
        }
        chunks.push(next.value);
        length += next.value.byteLength;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

async function parseForm(contentType: string, stream: ReadableStream<Uint8Array>): Promise<FormData> {
    return new Response(stream, { headers: { 'content-type': contentType } }).formData();
}

function blobFrom(bytes: Uint8Array): Blob {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return new Blob([copy]);
}

describe('serializeMultipartStreamBody', () => {
    it('continues after empty file chunks and preserves the file contents', async () => {
        let step = 0;
        const source = new ReadableStream<Uint8Array>(
            {
                pull(controller) {
                    if (step++ < 2) {
                        controller.enqueue(new Uint8Array());
                    } else {
                        controller.enqueue(textEncoder.encode('file'));
                        controller.close();
                    }
                },
            },
            { highWaterMark: 0 },
        );
        const serialized = Result.unwrap(
            serializeMultipartStreamBody([
                {
                    name: 'file',
                    value: { stream: source, filename: 'a.txt', type: 'text/plain', size: 4 },
                },
            ]),
        );
        const form = await parseForm(serialized.contentType, serialized.stream);
        const file = form.get('file');
        assert.ok(file instanceof File);
        assert.equal(await file.text(), 'file');
    });

    it('allows cancellation after an empty file chunk', async () => {
        let cancelled = false;
        const source = new ReadableStream<Uint8Array>(
            {
                pull(controller) {
                    controller.enqueue(new Uint8Array());
                },
                cancel() {
                    cancelled = true;
                },
            },
            { highWaterMark: 0 },
        );
        const serialized = Result.unwrap(
            serializeMultipartStreamBody([
                {
                    name: 'file',
                    value: { stream: source, filename: 'a.bin', type: 'application/octet-stream' },
                },
            ]),
        );
        const reader = serialized.stream.getReader();
        await reader.read();
        assert.equal((await reader.read()).value?.byteLength, 0);
        await reader.cancel();
        assert.equal(cancelled, true);
        assert.equal(source.locked, false);
    });

    it('preserves an undefined exception when opening a file stream', async () => {
        const source = fileStream(new Uint8Array([1]));
        Object.defineProperty(source, 'getReader', {
            value: () => {
                throw undefined;
            },
        });
        const serialized = Result.unwrap(
            serializeMultipartStreamBody([
                {
                    name: 'file',
                    value: { stream: source, filename: 'a.bin', type: 'application/octet-stream' },
                },
            ]),
        );
        const reader = serialized.stream.getReader();
        await reader.read();
        const result = await reader.read().then(
            () => ({ rejected: false, reason: 'unexpected success' }),
            (reason: unknown) => ({ rejected: true, reason }),
        );
        assert.equal(result.rejected, true);
        assert.equal(result.reason, undefined);
    });

    it('encodes repeated fields and non-ASCII filenames', async () => {
        const serialized = Result.unwrap(
            serializeMultipartStreamBody([
                { name: 'название', value: 'аватар' },
                { name: 'order', value: 2 },
                { name: 'active', value: false },
                {
                    name: 'file',
                    value: {
                        stream: fileStream(new Uint8Array([1, 2, 3, 4])),
                        filename: 'фото "1".png',
                        type: 'image/png',
                        size: 4,
                    },
                },
                {
                    name: 'file',
                    value: {
                        stream: fileStream(textEncoder.encode('second')),
                        filename: 'b.txt',
                        type: 'text/plain',
                        size: 6,
                    },
                },
            ]),
        );

        assert.match(serialized.contentType, /^multipart\/form-data; boundary=----ezzyform[0-9a-f]{32}$/u);
        assert.equal(typeof serialized.contentLength, 'number');
        const bytes = await readBytes(serialized.stream);
        assert.equal(bytes.byteLength, serialized.contentLength);
        const form = await parseForm(serialized.contentType, blobFrom(bytes).stream());
        assert.equal(form.get('название'), 'аватар');
        assert.equal(form.get('order'), '2');
        assert.equal(form.get('active'), 'false');
        const files = form.getAll('file');
        const first = files[0];
        const second = files[1];
        assert.ok(first instanceof File);
        assert.ok(second instanceof File);
        if (!(first instanceof File) || !(second instanceof File)) {
            return;
        }
        assert.equal(first.name, 'фото "1".png');
        assert.equal(first.type, 'image/png');
        assert.deepEqual(new Uint8Array(await first.arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
        assert.equal(second.name, 'b.txt');
        assert.equal(second.type, 'text/plain');
        assert.equal(await second.text(), 'second');
    });

    it('pulls a file as the multipart stream is read instead of buffering it', async () => {
        let pulls = 0;
        const chunks = 8;
        const chunkSize = 64;
        const source = new ReadableStream<Uint8Array>(
            {
                pull(controller) {
                    pulls += 1;
                    if (pulls > chunks) {
                        controller.close();
                        return;
                    }
                    controller.enqueue(new Uint8Array(chunkSize).fill(pulls));
                },
            },
            new CountQueuingStrategy({ highWaterMark: 1 }),
        );
        const serialized = Result.unwrap(
            serializeMultipartStreamBody([
                {
                    name: 'file',
                    value: {
                        stream: source,
                        filename: 'a.bin',
                        type: 'application/octet-stream',
                        size: chunks * chunkSize,
                    },
                },
            ]),
        );
        assert.equal(pulls, 0);

        const reader = serialized.stream.getReader();
        const header = await reader.read();
        assert.equal(header.done, false);
        assert.ok(header.value.byteLength > chunkSize);
        assert.ok(pulls < chunks);

        let fileBytes = 0;
        while (fileBytes < chunks * chunkSize) {
            const next = await reader.read();
            assert.equal(next.done, false);
            assert.ok(next.value.byteLength <= chunkSize);
            fileBytes += next.value.byteLength;
            assert.ok(pulls <= chunks + 1);
        }
        assert.equal(fileBytes, chunks * chunkSize);
        assert.ok(pulls <= chunks + 1);
        await reader.cancel();
    });

    it('omits content length when any file size is unknown', async () => {
        const serialized = Result.unwrap(
            serializeMultipartStreamBody([
                {
                    name: 'file',
                    value: {
                        stream: fileStream(textEncoder.encode('abc')),
                        filename: 'a.bin',
                        type: 'application/octet-stream',
                    },
                },
            ]),
        );

        assert.equal(serialized.contentLength, undefined);
        const form = await parseForm(serialized.contentType, serialized.stream);
        const file = form.get('file');
        assert.ok(file instanceof File);
        assert.equal(file.name, 'a.bin');
        assert.equal(file.type, 'application/octet-stream');
        assert.equal(await file.text(), 'abc');
    });

    it('uses the octet-stream default for an empty media type', async () => {
        const serialized = Result.unwrap(
            serializeMultipartStreamBody([
                {
                    name: 'file',
                    value: {
                        stream: fileStream(new Uint8Array()),
                        filename: 'empty.bin',
                        type: '   ',
                        size: 0,
                    },
                },
            ]),
        );

        const form = await parseForm(serialized.contentType, serialized.stream);
        const file = form.get('file');
        assert.ok(file instanceof File);
        assert.equal(file.type, 'application/octet-stream');
        assert.equal(file.size, 0);
    });

    it('cancels unread file streams when the multipart stream is cancelled', async () => {
        let reason: unknown = 'pending';
        const source = new ReadableStream<Uint8Array>({
            pull(controller) {
                controller.enqueue(new Uint8Array([1]));
            },
            cancel(cancelReason) {
                reason = cancelReason;
            },
        });
        const serialized = Result.unwrap(
            serializeMultipartStreamBody([
                {
                    name: 'file',
                    value: {
                        stream: source,
                        filename: 'a.bin',
                        type: 'application/octet-stream',
                        size: 4,
                    },
                },
            ]),
        );
        const reader = serialized.stream.getReader();
        await reader.read();

        await reader.cancel('stop');

        assert.equal(reason, 'stop');
    });

    it('fails the multipart stream when the source errors or breaks its declared size', async () => {
        const brokenSource = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.error(new Error('source broke'));
            },
        });
        const broken = Result.unwrap(
            serializeMultipartStreamBody([
                {
                    name: 'file',
                    value: {
                        stream: brokenSource,
                        filename: 'a.bin',
                        type: 'application/octet-stream',
                    },
                },
            ]),
        );
        const brokenReader = broken.stream.getReader();
        await brokenReader.read();
        await assert.rejects(brokenReader.read(), /source broke/u);
        assert.equal(brokenSource.locked, false);

        const short = Result.unwrap(
            serializeMultipartStreamBody([
                {
                    name: 'file',
                    value: {
                        stream: fileStream(new Uint8Array([1])),
                        filename: 'a.bin',
                        type: 'application/octet-stream',
                        size: 4,
                    },
                },
            ]),
        );
        await assert.rejects(readBytes(short.stream), /expected 4/u);

        const longSource = fileStream(new Uint8Array([1, 2]));
        const long = Result.unwrap(
            serializeMultipartStreamBody([
                {
                    name: 'file',
                    value: {
                        stream: longSource,
                        filename: 'a.bin',
                        type: 'application/octet-stream',
                        size: 1,
                    },
                },
            ]),
        );
        await assert.rejects(readBytes(long.stream), /declared size of 1/u);
        assert.equal(longSource.locked, false);
    });

    it('unlocks the active source when multipart cancellation is pending or rejects', async () => {
        for (const cancelMode of ['reject', 'pending'] as const) {
            let pulled: () => void = () => undefined;
            const pullStarted = new Promise<void>((resolve) => {
                pulled = resolve;
            });
            const source = new ReadableStream<Uint8Array>(
                {
                    pull() {
                        pulled();
                        return new Promise<void>(() => undefined);
                    },
                    cancel() {
                        return cancelMode === 'reject'
                            ? Promise.reject(new Error('cleanup failed'))
                            : new Promise<void>(() => undefined);
                    },
                },
                { highWaterMark: 0 },
            );
            const serialized = Result.unwrap(
                serializeMultipartStreamBody([
                    {
                        name: 'file',
                        value: { stream: source, filename: 'a.bin', type: 'application/octet-stream' },
                    },
                ]),
            );
            const reader = serialized.stream.getReader();
            await reader.read();
            const pendingRead = reader.read();
            await pullStarted;
            assert.equal(source.locked, true);
            const cancellation = reader.cancel('stop');
            assert.equal(source.locked, false);
            assert.equal((await pendingRead).done, true);
            if (cancelMode === 'reject') {
                await cancellation;
            }
        }
    });

    it('unlocks a source even when cancellation after a size error never settles', async () => {
        const source = new ReadableStream<Uint8Array>({
            pull(controller) {
                controller.enqueue(new Uint8Array([1, 2]));
            },
            cancel() {
                return new Promise<void>(() => undefined);
            },
        });
        const serialized = Result.unwrap(
            serializeMultipartStreamBody([
                {
                    name: 'file',
                    value: { stream: source, filename: 'a.bin', type: 'application/octet-stream', size: 1 },
                },
            ]),
        );
        await assert.rejects(readBytes(serialized.stream), /declared size of 1/u);
        assert.equal(source.locked, false);
    });

    it(
        'reports the source error even if cancelling an unread file never finishes',
        { timeout: 1000 },
        async () => {
            const sourceError = new Error('source broke');
            let cancelReason: unknown;
            const serialized = Result.unwrap(
                serializeMultipartStreamBody([
                    {
                        name: 'broken',
                        value: {
                            stream: new ReadableStream<Uint8Array>({
                                start(controller) {
                                    controller.error(sourceError);
                                },
                            }),
                            filename: 'broken.bin',
                            type: 'application/octet-stream',
                        },
                    },
                    {
                        name: 'unread',
                        value: {
                            stream: new ReadableStream<Uint8Array>({
                                cancel(reason) {
                                    cancelReason = reason;
                                    return new Promise<void>(() => undefined);
                                },
                            }),
                            filename: 'unread.bin',
                            type: 'application/octet-stream',
                        },
                    },
                ]),
            );
            const reader = serialized.stream.getReader();
            await reader.read();
            await assert.rejects(reader.read(), (error: unknown) => error === sourceError);
            assert.equal(cancelReason, sourceError);
        },
    );

    it('rejects a missing or mistyped body before reading file streams', () => {
        let pulls = 0;
        const source = new ReadableStream<Uint8Array>({
            pull(controller) {
                pulls += 1;
                controller.close();
            },
        });
        const cases = [
            undefined,
            null,
            new FormData(),
            { name: 'title', value: 'avatar' },
            [{ value: 'avatar' }],
            [{ name: 'title', value: Number.NaN }],
            [{ name: 'title', value: ['nope'] }],
            [{ name: 'file', value: new Blob(['bytes']) }],
            [
                {
                    name: 'file',
                    value: { stream: source, filename: 'a.bin', type: 'text/plain\r\nX: y', size: 0 },
                },
            ],
            [{ name: 'file', value: { stream: source, filename: 'a.bin', type: 'text/plain', size: 1.5 } }],
        ];

        for (const body of cases) {
            const result = serializeMultipartStreamBody(body);
            assert.equal(Result.isFailure(result), true);
            if (Result.isFailure(result)) {
                assert.equal(result.error.type, 'MultipartStreamBodySerializationError');
            }
        }
        assert.equal(pulls, 0);
    });

    it('rejects a locked file stream', () => {
        const stream = new ReadableStream<Uint8Array>();
        stream.getReader();

        const result = serializeMultipartStreamBody([
            { name: 'file', value: { stream, filename: 'a.bin', type: 'application/octet-stream' } },
        ]);

        const error = Result.unwrapError(result);
        assert.equal(error.reason, 'InvalidValue');
    });
});
