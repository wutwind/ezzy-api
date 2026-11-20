export interface MultipartBody {
    readonly kind: 'multipart';
}

export interface StreamBody {
    readonly kind: 'stream';
}

export type BodyKind = MultipartBody | StreamBody;

export type BodyKindType = BodyKind['kind'];

export type MultipartBodyInput = FormData | Readonly<Record<string, string | number | boolean | Blob>>;

export type StreamBodyInput = ReadableStream<Uint8Array>;

export function multipartBody(): MultipartBody {
    return { kind: 'multipart' };
}

export function streamBody(): StreamBody {
    return { kind: 'stream' };
}

export function isBodyKind(value: unknown): value is BodyKind {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const kind: unknown = Reflect.get(value, 'kind');
    return kind === 'multipart' || kind === 'stream';
}
