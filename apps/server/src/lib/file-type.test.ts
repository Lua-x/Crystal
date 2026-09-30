import { describe, expect, it } from 'vitest'

import { detectAttachmentType, imageSize } from './file-type.js'

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === 'string' ? [...value].map((char) => char.charCodeAt(0)) : [value],
    ),
  )

/** An `ftyp` box with the given major and compatible brands. */
const ftyp = (major: string, ...compatible: string[]) => {
  const size = 16 + compatible.length * 4
  return bytes(0, 0, 0, size, 'ftyp', major, 0, 0, 0, 0, ...compatible)
}

describe('detectAttachmentType', () => {
  it('recognizes images and PDFs by their content', () => {
    expect(detectAttachmentType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png')
    expect(detectAttachmentType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(detectAttachmentType(bytes('GIF89a'))).toBe('image/gif')
    expect(detectAttachmentType(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp')
    expect(detectAttachmentType(bytes('%PDF-1.7\n'))).toBe('application/pdf')
    expect(detectAttachmentType(ftyp('avif', 'mif1', 'miaf'))).toBe('image/avif')
    expect(detectAttachmentType(ftyp('heic', 'mif1', 'heic'))).toBe('image/heic')
    expect(detectAttachmentType(ftyp('mif1', 'avif'))).toBe('image/avif')
  })

  it('rejects everything else, whatever it is called', () => {
    expect(detectAttachmentType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull()
    expect(detectAttachmentType(bytes('<!doctype html><script>'))).toBeNull()
    expect(detectAttachmentType(bytes('PK', 3, 4))).toBeNull()
    expect(detectAttachmentType(ftyp('isom', 'mp41'))).toBeNull()
    expect(detectAttachmentType(bytes())).toBeNull()
  })
})

describe('imageSize', () => {
  const uint32 = (value: number) => [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ]
  const uint16le = (value: number) => [value & 255, (value >>> 8) & 255]

  it('reads PNG, GIF and JPEG headers', () => {
    const png = bytes(
      0x89,
      'PNG',
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      0,
      0,
      0,
      13,
      'IHDR',
      ...uint32(2048),
      ...uint32(1536),
    )
    expect(imageSize(png)).toEqual({ width: 2048, height: 1536 })
    expect(imageSize(bytes('GIF89a', ...uint16le(320), ...uint16le(200)))).toEqual({
      width: 320,
      height: 200,
    })
    // SOI, an APP0 segment of 16 bytes, then a baseline frame header.
    const jpeg = bytes(
      0xff,
      0xd8,
      0xff,
      0xe0,
      0,
      16,
      'JFIF',
      0,
      1,
      1,
      0,
      0,
      1,
      0,
      1,
      0,
      0,
      0xff,
      0xc0,
      0,
      17,
      8,
      0x04,
      0x38,
      0x07,
      0x80,
      3,
    )
    expect(imageSize(jpeg)).toEqual({ width: 1920, height: 1080 })
  })

  it('reads the three kinds of WebP', () => {
    const riff = (chunk: string, ...rest: number[]) =>
      bytes('RIFF', 0, 0, 0, 0, 'WEBP', chunk, 0, 0, 0, 0, ...rest)
    const lossy = riff('VP8 ', 0, 0, 0, 0x9d, 0x01, 0x2a, ...uint16le(640), ...uint16le(480), 0, 0)
    expect(imageSize(lossy)).toEqual({ width: 640, height: 480 })
    // 1000 × 750: width-1 = 999 (14 bits), height-1 = 749 (14 bits), packed little-endian.
    const packed = (999 | (749 << 14)) >>> 0
    const lossless = riff(
      'VP8L',
      0x2f,
      packed & 255,
      (packed >>> 8) & 255,
      (packed >>> 16) & 255,
      (packed >>> 24) & 255,
      0,
      0,
      0,
      0,
      0,
    )
    expect(imageSize(lossless)).toEqual({ width: 1000, height: 750 })
    const extended = riff('VP8X', 0, 0, 0, 0, 0x7f, 0x0c, 0, 0x37, 0x09, 0, 0, 0)
    expect(imageSize(extended)).toEqual({ width: 3200, height: 2360 })
  })

  it('gives up on other formats and broken files', () => {
    expect(imageSize(bytes('%PDF-1.7\n'))).toBeNull()
    expect(imageSize(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBeNull()
    expect(imageSize(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xd9, 0, 0))).toBeNull()
  })
})
