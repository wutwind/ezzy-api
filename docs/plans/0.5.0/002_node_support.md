# 002 — Node support matrix

Status: **ready after 0.2.0**
Branch: `chore/node-matrix`
Depends on: 0.2.0 no-throw API
Release request: [`../0.5.0.md`](../0.5.0.md)

## Decision

Set the consumer runtime floor to Node 22 and keep the development container on Node 24. Remove
`--test-isolation=none`, which is unavailable before Node 24.

CI must distinguish the claims it verifies:

- exact minimum Node 22.0.x: built-package smoke tests;
- current Node 22: full contributor suite;
- current Node 24: full contributor suite and release checks.

Document that source-level tests require Node 22.18+ because they rely on unflagged type stripping.
Run the compiled smoke test at the exact engine floor so Node 24 type declarations do not mask an
accidental newer runtime API.
