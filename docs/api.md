# API

Everything the web app does goes through a JSON API under `/api/v1`, described by an OpenAPI
3.1 document at `/api/openapi.json`. The interactive documentation at **`/api/docs`** lists every
endpoint with its parameters and answers, and lets you try them out.

## Personal access tokens

Scripts, shortcuts and other apps authenticate with a personal access token. Create one under
**Settings → API**, choose whether it may only read or also change data, and how long it stays
valid. The token is shown once – copy it right away. Send it in the `Authorization` header:

```bash
curl -H "Authorization: Bearer crystal_…" https://todo.example.com/api/v1/views/my-day
```

Add a task to your default list:

```bash
curl -X POST https://todo.example.com/api/v1/tasks \
  -H "Authorization: Bearer crystal_…" \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy milk", "dueDate": "2026-10-01"}'
```

What tokens can do:

- Read and (with “Read and change”) change lists, list groups, tasks and steps, smart lists,
  search, tags and the people you can share with, and follow live updates (`/api/v1/events`).
- Read your profile (`GET /api/v1/me`).
- Nothing else: account settings (profile, password, devices, tokens, notifications), sign-in
  and administration always need a signed-in browser. Such requests answer `403` with the
  error code `token_not_allowed`.

Tokens stop working when they expire, when you revoke them, and when the account is disabled.
Crystal stores only a hash of each token. Every token starts with `crystal_`, so secret scanners
and people can recognize it.

## Errors

Errors use the shape `{ "error": { "code": "…", "message": "…", "details": … } }`. The codes are
stable and listed in [`packages/shared/src/errors.ts`](../packages/shared/src/errors.ts);
validation errors (`validation_failed`) list the invalid fields in `details`.

## Rate limits

Each account can make 600 requests per minute. When the limit is reached, Crystal answers `429`
with a `Retry-After` header.
