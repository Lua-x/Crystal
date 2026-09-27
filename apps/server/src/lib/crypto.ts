import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

/** A URL-safe random token with 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
}

/**
 * Derives an independent 256-bit key for one purpose from the instance secret,
 * so that no two features ever share key material.
 */
export function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'crystal', purpose, 32))
}

const IV_LENGTH = 12
const TAG_LENGTH = 16

/** Encrypts and authenticates a string with AES-256-GCM. */
export function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

/** Reverses `seal`. Returns `null` if the value was tampered with or uses another key. */
export function unseal(sealed: string, key: Buffer): string | null {
  try {
    const data = Buffer.from(sealed, 'base64url')
    if (data.length < IV_LENGTH + TAG_LENGTH) return null
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, IV_LENGTH))
    decipher.setAuthTag(data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH))
    return Buffer.concat([
      decipher.update(data.subarray(IV_LENGTH + TAG_LENGTH)),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}
