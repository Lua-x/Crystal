import { pino, type Logger as PinoLogger } from 'pino'

import type { Config } from '../config.js'

export type Logger = PinoLogger

export function createLogger(config: Pick<Config, 'env' | 'logLevel'>): Logger {
  const pretty = config.env === 'development' && process.stdout.isTTY
  return pino({
    level: config.logLevel,
    // Never log credentials, even if a future log call passes a request body.
    redact: {
      paths: ['password', 'newPassword', 'currentPassword', '*.password', 'token', '*.token'],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  })
}
