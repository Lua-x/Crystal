# Backup and restore

Everything Crystal stores lives in one place: the data directory (`/data` in the container,
the `crystal-data` volume with Docker Compose).

| File                     | Content                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `crystal.db`             | The SQLite database with all accounts and data                  |
| `crystal.db-wal`, `-shm` | SQLite's write-ahead log; part of the database while it is open |
| `secret.key`             | Generated secret (only if `SECRET_KEY` is not set)              |

Scheduled, automatic backups with retention are planned (see the [roadmap](../ROADMAP.md)).
Until then, back up manually as shown below.

## Back up

The safest way is to stop Crystal for a moment, so the database files are consistent:

```bash
docker compose stop crystal
docker run --rm -v crystal_crystal-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/crystal-backup-$(date +%F).tar.gz -C /data .
docker compose start crystal
```

The volume name is `<project>_crystal-data`; the project is the directory name of your
`docker-compose.yml` (check with `docker volume ls`).

## Restore

```bash
docker compose down
docker run --rm -v crystal_crystal-data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/crystal-backup-2026-09-27.tar.gz -C /data && chown -R 65532:65532 /data'
docker compose up -d
```

Crystal runs as user `65532`, so restored files must belong to it (the `chown` above).

## Moving to another server

Restore the backup on the new server as above. Keep `BASE_URL` in sync with the new address.
If you set `SECRET_KEY` explicitly, copy it too.
