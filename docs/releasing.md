# Release process

This document describes the release process for `@wutwind/ezzy-api`. The process intentionally keeps branch
management simple and publishes packages only from version tags.

## Principles

- `main` is the only permanent branch.
- Ordinary commits and pushes never publish a package.
- A release is prepared in a regular commit that updates the version and changelog.
- A version tag is the explicit publication trigger.
- The tag, package version, and changelog version must match.
- CI verifies the exact package tarball before publishing it.
- Published npm versions are immutable. A broken release must be followed by a new patch version.

## Release flow

```text
Update package version and changelog
→ commit the release preparation
→ run the local release-tag script
→ inspect the annotated tag
→ push the tag explicitly
→ GitHub Actions verifies and publishes the package
→ create a GitHub Release for the tag
```

No release branch is required.

## 1. Prepare the release commit

Update both `package.json` and `package-lock.json` to the intended version. Add a matching section
to `CHANGELOG.md` with the release date and user-visible changes.

Commit these changes as a normal commit on `main`:

```text
chore: prepare 0.1.0 release
```

The commit may also contain packaging or release-documentation changes that are specific to that
version. Feature and bug-fix work should be committed separately.

## 2. Create the local version tag

A release script will be exposed as:

```bash
npm run release:tag
```

The script must read the version from `package.json`; the version should not be passed separately.
Before creating a tag, it must verify that:

- the working tree is clean;
- the current branch is `main`;
- `package.json` and `package-lock.json` contain the same version;
- `CHANGELOG.md` contains a section for that version;
- the corresponding local and remote tags do not already exist;
- `npm run check` succeeds;
- the production build succeeds;
- the npm tarball passes a consumer smoke test.

After the checks pass, the script creates an annotated tag:

```bash
git tag -a v0.1.0 -m "Release 0.1.0"
```

The script must not push the tag by default. This leaves a final review point before publication:

```bash
git show v0.1.0
```

## 3. Trigger publication

Push the reviewed tag explicitly:

```bash
git push origin v0.1.0
```

Pushing the tag is the point that starts the publication workflow. Deleting or moving a published
tag does not make an npm version reusable.

## 4. GitHub Actions publication

The publication workflow will live in `.github/workflows/publish.yml` and run only for version-tag
pushes:

```yaml
on:
    push:
        tags:
            - 'v*'
```

The workflow must independently repeat the important checks instead of trusting the local script:

1. Validate that the tag is a supported semantic version.
2. Verify that the tag matches the version in `package.json` and `package-lock.json`.
3. Verify that `CHANGELOG.md` contains the version.
4. Install locked dependencies with `npm ci`.
5. Run type checking, linting, formatting checks, and tests with `npm run check`.
6. Build the production package.
7. Create an npm tarball and run the consumer smoke test against that tarball.
8. Confirm that the version is not already present on npm.
9. Publish the verified tarball to npm.
10. Create a GitHub Release and attach the tarball after publication succeeds.

The workflow must publish the same tarball that passed the smoke test, not create a second package
after verification.

## Authentication and protection

The first package version is published locally with an interactive npm login. Verify that
`npm whoami` returns the expected account, then publish the exact tarball that passed the smoke
test:

```bash
npm login
npm run check
npm run build
npm pack --json --ignore-scripts
node scripts/smoke-package.mjs wutwind-ezzy-api-0.1.0.tgz
npm publish wutwind-ezzy-api-0.1.0.tgz --access public
```

After the package exists on npm, configure Trusted Publishing for subsequent automated releases:

- organization or user: `wutwind`;
- repository: `ezzy-api`;
- workflow filename: `publish.yml`;
- environment: `npm-production`;
- allowed action: `npm publish`.

The workflow authenticates through GitHub OIDC with `id-token: write`; no npm token or GitHub
secret is required. A protected GitHub environment named `npm-production` may require maintainer
approval before publication.

Protect tags matching `v*` so only maintainers can create release tags.

## Continuous integration outside releases

Pull requests and pushes to `main` should run validation but must never publish:

```bash
npm ci
npm run check
npm run build
npm pack --dry-run
```

The consumer smoke test should also run in ordinary CI when packaging configuration changes.

## Consumer smoke test

The smoke test creates a temporary project, installs the generated tarball, and verifies:

- the package can be imported as an ES module;
- the documented runtime exports are available;
- TypeScript can resolve the public declarations;
- a minimal typed API definition compiles;
- source files, tests, and local configuration are absent from the tarball;
- `README.md`, `LICENSE`, `CHANGELOG.md`, and the usage guide are present.

## Current automation status

The release-tag script, consumer smoke test, CI workflow, and tag-triggered publication workflow
are implemented in the repository. GitHub tag protection, the `npm-production` environment, the
initial npm publication, and npm Trusted Publishing must be configured by a maintainer.
