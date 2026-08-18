# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
