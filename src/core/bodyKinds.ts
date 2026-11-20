export interface MultipartBody {
    readonly kind: 'multipart';
}

export interface StreamBody {
    readonly kind: 'stream';
}

export type BodyKind = MultipartBody | StreamBody;

export type BodyKindType = BodyKind['kind'];

/** Call-time input for a multipartBody() endpoint. */
export type MultipartBodyInput = FormData | Readonly<Record<string, string | number | boolean | Blob>>;

/** Call-time input for a streamBody() endpoint. */
export type StreamBodyInput = ReadableStream<Uint8Array>;

/** Declares a multipart/form-data request body without schema validation. */
export function multipartBody(): MultipartBody {
    return { kind: 'multipart' };
}

/** Declares a raw ReadableStream<Uint8Array> request body without schema validation. */
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
