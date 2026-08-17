# 003 — Release integration

Status: **feature branch complete; release preparation pending on main**
Branch: `feat/no-throw`
Depends on: none; implementation is complete

## Checklist

- [x] Resolve or remove completed sections in `docs/todo.md`.
- [x] Rewrite README and `docs/usage.md` limitations.
- [x] Document typed constructor exceptions and no-throw endpoint execution.
- [x] Changelog: constructor API and Accept default.
- [x] Run typecheck, lint, formatting, runtime tests, build, and package smoke checks on the
      documented CI versions.
- [x] Verify the packed artifact from a clean consumer fixture.
- [x] Confirm every task document is either completed or explicitly moved to a later release.

After merging to `main`, update the package version and changelog, create the release-preparation
commit, and run the tag workflow described in [`docs/releasing.md`](../../releasing.md).
