# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- File upload endpoints: `body: multipartBody()` accepts `FormData` or a record of
  `string | number | boolean | Blob` fields, and `body: streamBody()` accepts a
  `ReadableStream<Uint8Array>` for chunked upload. Non-finite numbers are rejected.
  Multipart requests omit `content-type` so Fetch can set the boundary; a custom transport
  needs to do the same while the body is `FormData`.

### Changed

- `TransportRequest.body` now accepts `FormData` and `ReadableStream<Uint8Array>` in addition to
  `string`. Custom transport implementations that read the body need to handle the new types.

## [0.2.0] - 2026-08-18

### Changed

- Endpoint execution now catches recoverable platform and extension exceptions and returns typed
  failures. Invalid constructor configuration and API definitions fail immediately with typed
  exceptions.
- Requests now send `accept: application/json` by default and support normalized client-level and
  call-level headers with explicit override/removal semantics.

## [0.1.0] - 2026-08-17

### Added

- Type-safe HTTP API contracts backed by Standard Schema validators.
- Runtime request and response validation with typed error results.
- Fetch transport with cancellation support.
- Reusable API clients and transport interceptors.
- Configurable query-array serialization.
- Compiled JavaScript and TypeScript declarations for npm consumers.

[0.1.0]: https://github.com/wutwind/ezzy-api/releases/tag/v0.1.0
[0.2.0]: https://github.com/wutwind/ezzy-api/releases/tag/v0.2.0
