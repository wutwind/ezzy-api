export interface MultipartBody {
    readonly kind: 'multipart';
}

export interface MultipartStreamBody {
    readonly kind: 'multipart-stream';
}

export interface StreamBody {
    readonly kind: 'stream';
}

export type BodyKind = MultipartBody | MultipartStreamBody | StreamBody;

export type BodyKindType = BodyKind['kind'];

export type MultipartBodyInput = FormData | Readonly<Record<string, string | number | boolean | Blob>>;

/** File part whose bytes stay in `stream` until the transport reads them. */
export interface MultipartStreamFile {
    readonly stream: ReadableStream<Uint8Array>;
    readonly filename: string;
    readonly type: string;
    /** Exact byte length of `stream`, when it is known before reading. */
    readonly size?: number;
}

export interface MultipartStreamField {
    readonly name: string;
    readonly value: string | number | boolean | MultipartStreamFile;
}

/** Ordered parts. The same `name` may appear more than once. */
export type MultipartStreamBodyInput = readonly MultipartStreamField[];

export type StreamBodyInput = ReadableStream<Uint8Array>;

export function multipartBody(): MultipartBody {
    return { kind: 'multipart' };
}

export function multipartStreamBody(): MultipartStreamBody {
    return { kind: 'multipart-stream' };
}

export function streamBody(): StreamBody {
    return { kind: 'stream' };
}

export function isBodyKind(value: unknown): value is BodyKind {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const kind: unknown = Reflect.get(value, 'kind');
    return kind === 'multipart' || kind === 'multipart-stream' || kind === 'stream';
}
