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

## Docker Compose only

| Variable          | Default  | Description                                                      |
| ----------------- | -------- | ---------------------------------------------------------------- |
| `CRYSTAL_VERSION` | `latest` | Image tag, e.g. `1.2.3`, `1.2` or `1` to stay on a release line. |
| `CRYSTAL_PORT`    | `3000`   | Port published on the host.                                      |
