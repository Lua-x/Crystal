import { describe, expect, it } from 'vitest'

import { detectAttachmentType } from './file-type.js'

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
