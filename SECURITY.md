# Security policy

## Supported versions

Security fixes are released for the latest minor version. Before 1.0, only the latest
release is supported.

| Version        | Supported |
| -------------- | --------- |
| latest release | ✅        |
| older releases | ❌        |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/Lua-x/Crystal/security/advisories/new).
Include the affected version, steps to reproduce and the impact you expect.

What to expect:

- An acknowledgement within 7 days.
- An assessment and, if confirmed, a plan for a fix. Crystal is maintained in spare time, so
  complex fixes may take a few weeks – you will be kept informed.
- Credit in the release notes, unless you prefer to stay anonymous.

Please give us a reasonable amount of time to release a fix before disclosing the issue.

## Scope

In scope: the Crystal server, web app and the official Docker image.

Out of scope: vulnerabilities that require a compromised server or reverse proxy,
misconfigurations contrary to the documentation (for example publishing Crystal over plain
HTTP on the internet), and denial of service through excessive traffic.

## Hardening checklist for self-hosters

- Serve Crystal over HTTPS behind a reverse proxy and set `BASE_URL` and `TRUST_PROXY`
  ([docs/reverse-proxy.md](docs/reverse-proxy.md)).
- Keep `REGISTRATION=invite` (the default) or `closed` on instances reachable from the internet.
- Keep the image up to date (`docker compose pull && docker compose up -d`).
- Back up the data volume regularly ([docs/backup.md](docs/backup.md)) and protect the backups:
  they contain the database and the secret key.
