# 001 — Nullish query values

Status: **custom policy API requires design**
Branch: `fix/query-null`
Depends on: 0.2.0 no-throw API
Release request: [`../0.5.0.md`](../0.5.0.md)

## Default behavior

All nullish values are omitted by default. This includes top-level `null` and `undefined` values and
individual nullish array members. An array with no remaining values omits the key. Empty string
remains `key=` and an empty array omits the key.

This matters for optional pagination: Laravel distinguishes an omitted key from an empty value and
may reject `page=` with a 422 response.

## Custom nullish policy

Consumers must be able to provide a validation/serialization policy function in `QueryOptions` that
overrides the default for cases where `null` carries domain meaning, especially inside arrays:

```ts
{
    tags: ['a', null, 'b'];
}
```

The callback must receive enough context to distinguish a top-level value from an array member,
including the key, the nullish value, and the array index when present. It must return either an omit
decision or a supported query primitive to serialize, for example the string `"null"`. The exact
public type and name must be agreed before implementation. This policy runs after the endpoint query
schema; it customizes wire serialization rather than replacing schema validation.

As required by the no-throw contract, a callback exception becomes a typed request-validation
failure. Unsupported values returned by the callback also become typed failures.

Tests and documentation must cover every array format, an all-nullish array, empty strings, booleans,
zero, custom preservation of `null`, a throwing callback, and unsupported nested objects.
