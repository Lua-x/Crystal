# Changelog

All notable changes to Crystal are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Crystal uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-09-27

The foundation: accounts, sign-in, design system and a production-ready container. Lists
and tasks follow in 0.2.

### Added

- Accounts with usernames and optional email addresses; the first account becomes the
  administrator.
- Registration modes `invite` (default), `open` and `closed`, and invite links with usage
  limits, expiry and revocation.
- Single sign-on with OpenID Connect: automatic account creation, linking to existing
  accounts, admin group mapping.
- Settings for profile, language, time zone, password, appearance and signed-in devices.
- Administration of users (roles, disabling, password reset, deletion) and invite links.
- Design system with light and dark mode, nine accent colors or a custom one, adjusted
  automatically for WCAG AA contrast.
- English and German user interface.
- Docker image for `linux/amd64` and `linux/arm64` (distroless, non-root), Docker Compose
  file, health check at `/api/health`, OpenAPI document at `/api/openapi.json`.
- Security: Argon2id password hashing, hashed session tokens, CSRF protection, rate limiting,
  strict Content Security Policy.

[Unreleased]: https://github.com/Lua-x/crystal/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Lua-x/crystal/releases/tag/v0.1.0
