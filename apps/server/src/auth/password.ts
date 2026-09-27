import { hash, verify, type Options } from '@node-rs/argon2'

/**
 * Argon2id with the OWASP-recommended minimum parameters (19 MiB, 2 iterations,
 * 1 lane). `algorithm: 2` is Argon2id; the enum is a `const enum` and cannot be
 * imported under `isolatedModules`.
 */
const OPTIONS: Options = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    // Malformed hashes count as a mismatch instead of a server error.
    return false
  }
}

let dummyHash: Promise<string> | undefined

/**
 * Burns the same amount of time as a real verification. Used when the user does
 * not exist, so response times do not reveal which usernames are registered.
 */
export async function simulatePasswordVerification(password: string): Promise<false> {
  dummyHash ??= hashPassword('crystal-timing-equalizer')
  await verifyPassword(await dummyHash, password)
  return false
}
