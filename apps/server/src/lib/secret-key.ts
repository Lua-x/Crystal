import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Logger } from './logger.js'

const SECRET_FILE = 'secret.key'

/**
 * Returns the instance secret. Without `SECRET_KEY` in the environment, a random
 * key is generated on first start and kept in the data directory, readable only
 * by the server's user.
 */
export function resolveSecretKey(
  dataDir: string,
  fromEnv: string | undefined,
  logger: Logger,
): string {
  if (fromEnv) return fromEnv

  const path = join(dataDir, SECRET_FILE)
  try {
    return readFileSync(path, 'utf8').trim()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const secret = randomBytes(32).toString('hex')
  try {
    // `wx` fails if another process created the file in the meantime.
    writeFileSync(path, `${secret}\n`, { mode: 0o600, flag: 'wx' })
    logger.info({ path }, 'Generated a new secret key')
    return secret
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return readFileSync(path, 'utf8').trim()
    }
    throw error
  }
}
