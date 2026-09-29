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
