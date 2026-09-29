import { describe, expect, it } from 'vitest'

import { cleanFileName, contentDisposition } from './attachments.js'

describe('attachment file names', () => {
  it('keeps only the last path segment without control characters', () => {
    expect(cleanFileName('../../etc/passwd.png')).toBe('passwd.png')
    expect(cleanFileName('C:\\Users\\anna\\scan.pdf')).toBe('scan.pdf')
    expect(cleanFileName('bad\u0000name\n.png')).toBe('badname.png')
    expect(cleanFileName('   ')).toBe('attachment')
  })

  it('writes a Content-Disposition with an ASCII fallback and the UTF-8 name', () => {
    expect(contentDisposition('attachment', 'a"b.pdf')).toBe(
      'attachment; filename="a_b.pdf"; filename*=UTF-8\'\'a%22b.pdf',
    )
    expect(contentDisposition('inline', 'Kassenbon März.png')).toBe(
      'inline; filename="Kassenbon M_rz.png"; filename*=UTF-8\'\'Kassenbon%20M%C3%A4rz.png',
    )
  })
})
