# 003 — Zod 4 interoperability

Status: **ready after query semantics**
Branch: `test/zod-interop`
Depends on: 001
Release request: [`../0.5.0.md`](../0.5.0.md)

Add Zod 4 as a development dependency and cover Standard Schema request/response validation,
transformations, issue propagation, optional values, nullable query values, and empty responses.

README must state that any compatible Standard Schema implementation can be used and show a compact
Zod example alongside Valibot. CI should test the pinned supported Zod 4 range deliberately rather
than relying only on the lockfile's incidental version.
