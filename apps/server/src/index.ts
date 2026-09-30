import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serve } from '@hono/node-server'

import { createApp } from './app.js'
import { ConfigError, loadConfig, type Config } from './config.js'
import { openDatabase, runMigrations } from './db/client.js'
import { createLogger } from './lib/logger.js'
import { resolveSecretKey } from './lib/secret-key.js'
import { createServices } from './services/index.js'
import { APP_VERSION } from './version.js'

// `src/` in development, `dist/` in production; both sit next to `drizzle/`.
const here = dirname(fileURLToPath(import.meta.url))
const HOUR_MS = 60 * 60 * 1000

function main(): void {
  let config: Config
  try {
    config = loadConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`)
      process.exit(1)
    }
    throw error
  }

  const logger = createLogger(config)
  mkdirSync(config.dataDir, { recursive: true })
  const secretKey = resolveSecretKey(config.dataDir, config.secretKey, logger)

  const database = openDatabase(join(config.dataDir, 'crystal.db'))
  runMigrations(database.db, resolve(here, '../drizzle'))

  const services = createServices({
    config,
    logger,
    db: database.db,
    secretKey,
    version: APP_VERSION,
  })

  const staticDir = config.staticDir ?? resolve(here, '../public')
  const app = createApp(services, {
    staticDir: existsSync(join(staticDir, 'index.html')) ? staticDir : undefined,
  })

  if (config.oidc?.issuer.protocol === 'http:') {
    logger.warn('The OIDC issuer uses plain HTTP. Use HTTPS outside of trusted networks.')
  }
  if (config.env === 'production' && !config.baseUrl) {
    logger.warn('BASE_URL is not set. Set it to the public URL of this instance.')
  }

  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    logger.info({ port: info.port, version: APP_VERSION }, 'Crystal is running')
  })

  const cleanup = setInterval(() => {
    try {
      logger.debug(services.cleanup.run(), 'Cleanup finished')
    } catch (error) {
      logger.error({ err: error }, 'Cleanup failed')
    }
    // Files of attachments whose task was deleted for good.
    services.attachments.removeOrphans().then(
      (removed) => logger.debug({ removed }, 'Attachment cleanup finished'),
      (error: unknown) => logger.error({ err: error }, 'Attachment cleanup failed'),
    )
    // Pictures of lists that were deleted for good, and replaced covers.
    services.images.removeOrphans().then(
      (removed) => logger.debug({ removed }, 'Image cleanup finished'),
      (error: unknown) => logger.error({ err: error }, 'Image cleanup failed'),
    )
  }, HOUR_MS)
  cleanup.unref()

  services.reminders.start(config.reminderIntervalMs)
  services.backups.start()
  services.steam.start()
  if (config.backups.intervalHours === 0) logger.info('Automatic backups are turned off.')
  if (!config.smtp) logger.info('SMTP is not configured; email notifications are off.')

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down')
    clearInterval(cleanup)
    const remindersStopped = Promise.all([
      services.reminders.stop(),
      services.backups.stop(),
      services.steam.stop(),
    ])
    // Open event streams would keep the server from closing.
    services.events.closeAll()
    server.close(() => {
      // Let notifications that are on their way finish before closing the database.
      void remindersStopped
        .then(() => services.notifications.idle())
        .finally(() => {
          database.close()
          process.exit(0)
        })
    })
    // Do not hang forever on open keep-alive connections.
    setTimeout(() => process.exit(0), 10_000).unref()
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))
}

main()
