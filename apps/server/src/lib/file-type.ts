import type { AttachmentType } from '@crystal/shared'

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

/**
 * Recognizes the attachment types Crystal accepts by their first bytes. The
 * name and the type the browser claims are never trusted.
 */
export function detectAttachmentType(bytes: Uint8Array): AttachmentType | null {
  const startsWith = (signature: readonly number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte)
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp'
  }
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'

  // ISO base media files (AVIF, HEIC) start with an `ftyp` box listing their brands.
  if (startsWith([0x66, 0x74, 0x79, 0x70], 4)) {
    const boxSize = Math.min(
      new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0),
      bytes.length,
      256,
    )
    const brands = [ascii(8, 12)]
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) brands.push(ascii(offset, offset + 4))
    if (brands.some((brand) => AVIF_BRANDS.has(brand))) return 'image/avif'
    if (brands.some((brand) => HEIF_BRANDS.has(brand))) return 'image/heic'
  }
  return null
}

/**
 * Width and height of a PNG, JPEG, GIF or WebP picture, read from its header;
 * `null` for other formats or broken files.
 */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const has = (length: number) => bytes.length >= length
  const size = (width: number, height: number) =>
    width > 0 && height > 0 ? { width, height } : null

  switch (detectAttachmentType(bytes)) {
    case 'image/png':
      return has(24) ? size(view.getUint32(16), view.getUint32(20)) : null
    case 'image/gif':
      return has(10) ? size(view.getUint16(6, true), view.getUint16(8, true)) : null
    case 'image/webp':
      return webpSize(bytes, view)
    case 'image/jpeg':
      return jpegSize(bytes, view)
    default:
      return null
  }
}

function webpSize(bytes: Uint8Array, view: DataView): { width: number; height: number } | null {
  if (bytes.length < 30) return null
  const chunk = String.fromCharCode(...bytes.subarray(12, 16))
  if (chunk === 'VP8 ') {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    const [b0, b1, b2, b3] = bytes.subarray(21, 25) as unknown as [number, number, number, number]
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    }
  }
  if (chunk === 'VP8X') {
    const uint24 = (offset: number) =>
      view.getUint16(offset, true) | (view.getUint8(offset + 2) << 16)
    return { width: 1 + uint24(24), height: 1 + uint24(27) }
  }
  return null
}

/** Walks the JPEG segments up to the frame header, which holds the size. */
function jpegSize(bytes: Uint8Array, view: DataView): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]!
    // Fill bytes and markers without a length.
    if (marker === 0xff) {
      offset++
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }
    // Start-of-frame markers, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = view.getUint16(offset + 5)
      const width = view.getUint16(offset + 7)
      return width > 0 && height > 0 ? { width, height } : null
    }
    offset += 2 + view.getUint16(offset + 2)
  }
  return null
}
