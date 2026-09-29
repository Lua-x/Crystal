# Configuration

Crystal is configured entirely with environment variables. With Docker Compose, put them in a
`.env` file next to `docker-compose.yml` (start from [`.env.example`](../.env.example)).
Empty values count as unset. Invalid values stop the server at startup with a message that
lists every problem.

## Server

| Variable     | Default   | Description                                                                                                                                                                                                                  |
| ------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BASE_URL`   | –         | Public URL without a path, e.g. `https://todo.example.com`. Required for single sign-on. When set, only requests from exactly this origin are accepted (CSRF protection); when empty, the host the browser used is accepted. |
| `PORT`       | `3000`    | Port inside the container. To publish Crystal on another host port, change `CRYSTAL_PORT` instead.                                                                                                                           |
| `HOST`       | `0.0.0.0` | Address to listen on.                                                                                                                                                                                                        |
| `DATA_DIR`   | `/data`   | Directory for the database and the generated secret key (in Docker: the volume).                                                                                                                                             |
| `SECRET_KEY` | generated | At least 32 characters. Encrypts short-lived sign-in state. If empty, a random key is created on first start and stored in `DATA_DIR/secret.key`. Keep it when restoring backups.                                            |
| `LOG_LEVEL`  | `info`    | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. Logs are JSON lines on stdout.                                                                                                                               |

> [!TIP]
> Crystal runs as the unprivileged user `65532`. The named volume in `docker-compose.yml` gets
> the right ownership automatically. If you use a bind mount (e.g. `./data:/data`) instead, make
> the directory writable first: `sudo chown -R 65532:65532 ./data`.

## Reverse proxy and HTTPS

| Variable      | Default | Description                                                                                                                                                               |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY` | `false` | How many reverse proxies sit in front of Crystal: `false`, `true` (one) or a number. Only then are `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host` trusted. |
| `HSTS`        | `false` | Send `Strict-Transport-Security` (one year, including subdomains) over HTTPS. Many setups let the proxy do this instead.                                                  |

Session cookies are marked `Secure` (and use the `__Host-` prefix) automatically when
`BASE_URL` starts with `https://`. Without `BASE_URL`, the scheme of the request is used.

See [reverse-proxy.md](reverse-proxy.md) for Traefik, Caddy and Nginx examples.

## Accounts

| Variable           | Default  | Description                                                                                                                                                                                                                                       |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REGISTRATION`     | `invite` | `invite`: accounts only with an invite link from an administrator. `open`: anyone who can reach Crystal. `closed`: no registration (invite links do not work either). The very first account can always be created and becomes the administrator. |
| `PASSWORD_LOGIN`   | `true`   | Allow signing in with a username (or email) and password. Can only be disabled when single sign-on is configured.                                                                                                                                 |
| `SESSION_TTL_DAYS` | `30`     | Days a session stays valid without activity (1–365). Active sessions are extended automatically.                                                                                                                                                  |

## Single sign-on (OpenID Connect)

Register Crystal as a confidential client at your identity provider with the redirect URI
`<BASE_URL>/api/v1/auth/oidc/callback` and the scopes `openid profile email`.

| Variable             | Default                | Description                                                                                                                          |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `OIDC_ISSUER`        | –                      | Issuer URL, e.g. `https://auth.example.com/application/o/crystal/` (Authentik) or `https://auth.example.com/realms/home` (Keycloak). |
| `OIDC_CLIENT_ID`     | –                      | Client ID. Setting issuer and client ID enables single sign-on.                                                                      |
| `OIDC_CLIENT_SECRET` | –                      | Client secret (sent with `client_secret_basic`). Leave empty for public clients.                                                     |
| `OIDC_BUTTON_LABEL`  | `SSO`                  | Shown as “Continue with …” on the sign-in page.                                                                                      |
| `OIDC_SCOPES`        | `openid profile email` | Requested scopes. Add e.g. `groups` if your provider needs it for the groups claim.                                                  |
| `OIDC_AUTO_REGISTER` | `true`                 | Create an account on the first sign-in. When `false`, only accounts that linked the identity in their settings can sign in.          |
| `OIDC_ADMIN_GROUP`   | –                      | Members of this group become administrators; removing someone from the group removes the role at their next sign-in.                 |
| `OIDC_GROUPS_CLAIM`  | `groups`               | Name of the claim that contains the user's groups.                                                                                   |

Notes:

- The flow uses the authorization code grant with PKCE, `state` and `nonce`.
- An identity provider served over plain `http://` is accepted (for home networks), but
  this is logged as a warning.
- Crystal never links a single sign-on identity to an existing account just because the email
  address matches. Users with a local account sign in with their password and link single
  sign-on under **Settings → Account**.

## Notifications

Everyone chooses how they want to be notified under **Settings → Notifications**: in the
browser (Web Push), through [ntfy](https://ntfy.sh), [Gotify](https://gotify.net), an
[Apprise API](https://github.com/caronc/apprise-api) server, or by email. Crystal sends
reminders, a daily summary if someone asks for it, and a message when a task is assigned to
someone.

| Variable                    | Default | Description                                                                                                                                                                            |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REMINDER_INTERVAL_SECONDS` | `30`    | How often due reminders and daily summaries are checked (1–3600).                                                                                                                      |
| `NOTIFY_PRIVATE_NETWORKS`   | `true`  | Whether ntfy, Gotify and Apprise may be reached at loopback and private network addresses (where self-hosted services usually live). Set to `false` on instances with untrusted users. |

Web Push needs no configuration, but browsers only offer it over HTTPS (or on `localhost`).
The keys are derived from `SECRET_KEY`; if the key changes, everyone has to turn notifications
on again for their devices. On iPhone and iPad, Safari offers Web Push only to web apps added to
the Home Screen, which becomes possible with the installable app in a later release.

Crystal never follows redirects of notification services, stops waiting after ten seconds and
never shows what a service answered. Link-local addresses (such as cloud metadata services) are
always off limits.

### Email

Email is used for the email notification channel and to reset forgotten passwords. Resetting a
password also needs `BASE_URL`, so the link in the email points to the right place.

| Variable        | Default            | Description                                                                                       |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `SMTP_HOST`     | –                  | Mail server. Setting it enables email.                                                            |
| `SMTP_PORT`     | `587`              | Port of the mail server.                                                                          |
| `SMTP_SECURE`   | `true` on port 465 | `true` for implicit TLS (usually port 465). Otherwise STARTTLS is used when the server offers it. |
| `SMTP_USER`     | –                  | User name, if the server requires authentication.                                                 |
| `SMTP_PASSWORD` | –                  | Password for `SMTP_USER`.                                                                         |
| `SMTP_FROM`     | –                  | Sender, e.g. `Crystal <crystal@example.com>`. Required with `SMTP_HOST`.                          |

A reset link is valid for one hour and can be used once. Crystal sends at most three per
account and hour, answers the same way whether an account exists or not, and signs the account
out on every device after the password is changed.

## Backups

| Variable                | Default         | Description                                                 |
| ----------------------- | --------------- | ----------------------------------------------------------- |
| `BACKUP_INTERVAL_HOURS` | `24`            | Hours between automatic backups (1–720); `0` turns them off |
| `BACKUP_RETENTION`      | `7`             | How many backups are kept (1–365)                           |
| `BACKUP_DIR`            | `/data/backups` | Where backups are written; ideally on another disk          |

See [backup.md](backup.md) for restoring.

## Docker Compose only

| Variable          | Default  | Description                                                      |
| ----------------- | -------- | ---------------------------------------------------------------- |
| `CRYSTAL_VERSION` | `latest` | Image tag, e.g. `1.2.3`, `1.2` or `1` to stay on a release line. |
| `CRYSTAL_PORT`    | `3000`   | Port published on the host.                                      |
