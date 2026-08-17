# 002 — Error exports and type guards

Status: **ready after HTTP error shape**
Branch: `feat/error-guards`
Depends on: 001
Release request: [`../0.4.0.md`](../0.4.0.md)

## Scope

Export the remaining individual error types and guards for every `ApiError` member not already
covered by the timeout release. Guards accept `unknown`, not only `ApiError`, and validate the
minimum required structure rather than only trusting the `type` property.

```ts
isHttpError(value: unknown): value is HttpError
```

Tests cover every valid member, cross-member rejection, primitives, null, and incomplete objects.
