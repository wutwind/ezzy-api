import * as v from 'valibot';

import { validateResponse } from './validateResponse.ts';

const schema = v.pipe(
    v.string(),
    v.transform((value) => new Date(value)),
);

const result = await validateResponse(schema, '2026-08-14T00:00:00.000Z');

if (result.type === 'Success') {
    result.value satisfies Date;
    // @ts-expect-error response validation returns schema output, not input
    result.value satisfies string;
}
