# Backup and restore

Everything Crystal stores lives in one place: the data directory (`/data` in the container,
the `crystal-data` volume with Docker Compose).

| File or directory        | Content                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `crystal.db`             | The SQLite database with all accounts and data                  |
| `crystal.db-wal`, `-shm` | SQLite's write-ahead log; part of the database while it is open |
| `secret.key`             | Generated secret (only if `SECRET_KEY` is not set)              |
| `attachments/`           | Files attached to tasks                                         |
| `backups/`               | Automatic backups of the database                               |

## Automatic backups

Crystal backs up its database every 24 hours while it keeps running (SQLite's online backup
makes a consistent copy) and keeps the newest seven. Administrators see the backups under
**Settings → Backups**, can make one right away and download them.

| Variable                | Default         | Description                                                    |
| ----------------------- | --------------- | -------------------------------------------------------------- |
| `BACKUP_INTERVAL_HOURS` | `24`            | Hours between backups (1–720); `0` turns automatic backups off |
| `BACKUP_RETENTION`      | `7`             | How many backups are kept (1–365); older ones are deleted      |
| `BACKUP_DIR`            | `/data/backups` | Where backups are written                                      |

> [!IMPORTANT]
> A backup on the same disk does not survive a broken disk. Copy the backups elsewhere
> regularly – for example by mounting a directory of your NAS as `BACKUP_DIR`:
>
> ```yaml
> services:
>   crystal:
>     environment:
>       BACKUP_DIR: /backups
>     volumes:
>       - crystal-data:/data
>       - /mnt/nas/crystal:/backups
> ```
>
> The directory must be writable by user `65532` (`sudo chown -R 65532:65532 /mnt/nas/crystal`).

Backups contain the database only. Two more things are worth keeping a copy of:

- the `attachments/` directory with the files attached to tasks, and
- the secret key (`secret.key`, or `SECRET_KEY` if you set it). It encrypts notification
  settings and calendar links, and Web Push is tied to it.

The full backup of the data directory below covers everything.

## Restore a backup

Stop Crystal, replace the database with the backup, and start it again:

```bash
docker compose stop crystal
docker run --rm -v crystal_crystal-data:/data alpine \
  sh -c 'cd /data && rm -f crystal.db-wal crystal.db-shm && cp backups/crystal-2026-09-29T03-00-00Z.db crystal.db && chown 65532:65532 crystal.db'
docker compose start crystal
```

The volume name is `<project>_crystal-data`; the project is the directory name of your
`docker-compose.yml` (check with `docker volume ls`). Remove the `-wal` and `-shm` files as
shown: they belong to the database you replace.

## Full backup of the data directory

To take everything along at once – for example when moving to another server – archive the
whole volume while Crystal is stopped:

```bash
docker compose stop crystal
docker run --rm -v crystal_crystal-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/crystal-data-$(date +%F).tar.gz -C /data .
docker compose start crystal
```

Restore it on the new server:

```bash
docker compose down
docker run --rm -v crystal_crystal-data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/crystal-data-2026-09-29.tar.gz -C /data && chown -R 65532:65532 /data'
docker compose up -d
```

Crystal runs as user `65532`, so restored files must belong to it (the `chown` above). Keep
`BASE_URL` in sync with the new address. If you set `SECRET_KEY` explicitly, copy it too.

## Your own data

Everyone can download their lists and tasks as a file under **Settings → Import & export** and
import it again later, on this or another instance.
