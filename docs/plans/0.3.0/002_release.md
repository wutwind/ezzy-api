# 002 — Release integration

Status: **pending timeout implementation**
Branch: `release/0.3.0`
Depends on: 001

## Checklist

- Export and document `TimeoutError` and `isTimeoutError`.
- Document caller-signal composition and retry interaction.
- Add changelog and migration notes for the widened `ApiError` union.
- Run typecheck, lint, formatting, runtime tests, build, and package smoke checks.
