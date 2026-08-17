import { Result } from '@praha/byethrow';

import { serializeQuery, type SerializeQueryError } from './serializeQuery.ts';

const result = serializeQuery({
    search: 'types',
    page: 2,
    active: true,
    tag: ['ts', 'api'],
    optional: undefined,
});

serializeQuery({ tag: ['ts', 'api'] }, { arrayFormat: 'repeat' });
serializeQuery({ tag: ['ts', 'api'] }, { arrayFormat: 'brackets' });
serializeQuery({ tag: ['ts', 'api'] }, { arrayFormat: 'comma' });

result satisfies Result.Result<string, SerializeQueryError>;

serializeQuery({
    // @ts-expect-error null is not supported
    nullable: null,
});

serializeQuery({
    // @ts-expect-error nested objects are not supported
    filter: { active: true },
});

serializeQuery(
    {},
    {
        // @ts-expect-error unsupported array format
        arrayFormat: 'unknown',
    },
);
