import type { Result } from '@praha/byethrow';

import type { Transport, TransportRequest, TransportResponse } from './types.ts';

interface TestTransportError {
    readonly type: 'TestTransportError';
}

const request = {
    url: '/api/courses',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"name":"TypeScript"}',
} satisfies TransportRequest;

request.method satisfies 'POST';

const response: TransportResponse = {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: '{"id":"course-1"}',
};

const transport: Transport<TestTransportError> = {
    request: () => Promise.resolve({ type: 'Success', value: response }),
};

transport.request(request) satisfies Result.ResultAsync<TransportResponse, TestTransportError>;

const invalidRequest: TransportRequest = {
    url: '/api/courses',
    // @ts-expect-error transport methods are restricted to supported HTTP methods
    method: 'TRACE',
    headers: {},
};

void invalidRequest;
