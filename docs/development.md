# Development

## Prerequisites

- Node.js 24 (see `.node-version`)
- pnpm – the version pinned in `package.json` (`npm install -g pnpm@<version>` or Corepack)
- No compiler toolchain is needed: native modules (SQLite, Argon2) ship prebuilt binaries.

## Getting started

```bash
pnpm install
pnpm dev
```

This starts the API server on <http://localhost:3000> (restarting on changes) and the web app
with hot reload on <http://localhost:5173>, which proxies `/api` to the server. Open the web
app URL. Development defaults come from `.env.development`; put local overrides in `.env`.
Data is stored in `./data` (ignored by Git).

A development-only overview of all design tokens and components, in light and dark mode, is
available at <http://localhost:5173/dev/design>.

## Commands

| Command            | What it does                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `pnpm dev`         | API server and web app in watch mode                                  |
| `pnpm build`       | Production build (`apps/web/dist`, `apps/server/dist`)                |
| `pnpm start`       | Runs the production build (after `pnpm build`)                        |
| `pnpm test`        | Unit and integration tests (Vitest)                                   |
| `pnpm test:e2e`    | End-to-end tests (Playwright; run `pnpm build` first)                 |
| `pnpm lint`        | ESLint                                                                |
| `pnpm typecheck`   | TypeScript for every package                                          |
| `pnpm format`      | Prettier                                                              |
| `pnpm db:generate` | Creates a SQL migration after changing `apps/server/src/db/schema.ts` |

The first end-to-end run needs a browser: `pnpm exec playwright install chromium`.

## Project layout

```
apps/
  server/        Hono API server; also serves the web app in production
    src/
      config.ts    environment variables (validated with Zod)
      db/          Drizzle schema and database setup
      auth/        passwords, cookies, OpenID Connect
      middleware/  security headers, CSRF, sessions, rate limits, errors
      routes/      HTTP routes with OpenAPI definitions
      services/    business logic, independent of HTTP
    drizzle/     generated SQL migrations (run automatically on start)
    test/        integration tests against an in-memory database
  web/           React app (Vite)
    src/
      styles/      design tokens (tokens.css) and base styles
      components/  UI building blocks (Radix-based)
      features/    screens: auth, shell, settings, …
      lib/         API client, queries, i18n, accent colors, formatting
      locales/     translations (en.ts defines the keys, de.ts must match)
packages/
  shared/        Zod schemas, types and constants used by both apps
e2e/             Playwright tests (including axe accessibility checks)
docs/            documentation
```

## Conventions

- **Design tokens only.** Colors, radii, shadows, text sizes and easing come from
  `apps/web/src/styles/tokens.css`. Tailwind's default palette is disabled, so a class like
  `bg-red-500` does not exist. New colors are added as tokens – `tokens.test.ts` checks their
  contrast in light and dark mode.
- **Every UI string is translated.** Add keys to `locales/en.ts` and `locales/de.ts`; a missing
  German key is a type error.
- **Accessibility is part of done.** Use labels (the `Field` component wires them up), keep
  everything reachable by keyboard and check new screens with the e2e axe helper.
- **Schemas live in `packages/shared`** so the API and the forms validate the same way.
- **Errors** are thrown as `AppError` with a code from `ERROR_CODES`; the web app translates
  the code.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(web): …`, `fix(server): …`); a Git hook checks the message.

## Database migrations

1. Change `apps/server/src/db/schema.ts`.
2. Run `pnpm db:generate` and review the SQL in `apps/server/drizzle/`.
3. Commit both. Migrations run automatically when the server starts.

## Docker image

The CI builds the image and starts it with `docker compose`. Locally:

```bash
docker build -t ghcr.io/lua-x/crystal:latest .
docker compose up
```
