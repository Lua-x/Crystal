# Contributing to Crystal

Thanks for your interest in Crystal! Contributions of all kinds are welcome: bug reports,
ideas, translations, documentation and code.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs and suggesting features

- Search [existing issues](https://github.com/Lua-x/Crystal/issues) first.
- Use the issue templates – they ask for the details needed to help.
- **Security vulnerabilities** must not be reported publicly; see [SECURITY.md](SECURITY.md).

## Contributing code

1. For anything larger than a small fix, open an issue first to agree on the approach.
2. Fork the repository and create a branch from `main`.
3. Set up the project as described in [docs/development.md](docs/development.md).
4. Make your change, with tests. Keep pull requests focused on one thing.
5. Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and – for UI changes – `pnpm build && pnpm test:e2e`.
6. Open a pull request and fill in the template.

### Standards

- **Code, comments and commit messages are in English.** The UI is available in English and
  German; add new strings to both `apps/web/src/locales/en.ts` and `de.ts`.
- **Commits follow [Conventional Commits](https://www.conventionalcommits.org/)**, e.g.
  `feat(web): add task detail panel` or `fix(server): keep session on password reset`.
  Common scopes: `web`, `server`, `shared`, `e2e`, `docker`, `ci`, `docs`.
- **Design:** use the design tokens only (see [docs/development.md](docs/development.md#conventions)),
  check light and dark mode, phone width and keyboard use.
- **Accessibility:** WCAG 2.1 AA is a requirement, not a nice-to-have.
- **No new runtime dependencies** without a good reason – mention it in the pull request.
- **No telemetry, trackers or requests to third parties.**

### Translations

To add a language, copy `apps/web/src/locales/de.ts`, translate it, register it in
`apps/web/src/lib/i18n.ts` and add the language code to `SUPPORTED_LOCALES` in
`packages/shared/src/constants.ts`.

## License

By contributing, you agree that your contributions are licensed under the
[AGPL-3.0](LICENSE), the license of this project.
