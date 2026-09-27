/**
 * Generates a UUIDv7 (RFC 9562): 48-bit Unix timestamp in milliseconds followed by
 * random bits. IDs sort roughly by creation time and can be created on any client,
 * which lets offline clients create records without a round trip.
 */
export function uuidv7(timestamp: number = Date.now()): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  // Bitwise operators work on 32-bit integers, so the upper 16 bits of the
  // 48-bit timestamp are extracted with division instead.
  bytes[0] = Math.floor(timestamp / 2 ** 40) & 0xff
  bytes[1] = Math.floor(timestamp / 2 ** 32) & 0xff
  bytes[2] = (timestamp >>> 24) & 0xff
  bytes[3] = (timestamp >>> 16) & 0xff
  bytes[4] = (timestamp >>> 8) & 0xff
  bytes[5] = timestamp & 0xff
  bytes[6] = (bytes[6]! & 0x0f) | 0x70 // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 9562 variant

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Extracts the creation timestamp (ms) from a UUIDv7. */
export function uuidv7Timestamp(id: string): number {
  return Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16)
}
