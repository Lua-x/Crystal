import { describe, expect, it } from 'vitest'

import { csvRecords, parseCsv } from './csv.js'

const BOM = String.fromCharCode(0xfeff)

describe('parseCsv', () => {
  it('handles quotes, doubled quotes and line breaks in fields', () => {
    expect(parseCsv('a,b,c\r\n"x, y","say ""hi""","line\nbreak"\n')).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line\nbreak'],
    ])
  })

  it('detects semicolons, skips blank lines and the byte order mark', () => {
    expect(parseCsv(BOM + 'Betreff;Fällig am\n\n"Müll; Papier";01.10.2026\n')).toEqual([
      ['Betreff', 'Fällig am'],
      ['Müll; Papier', '01.10.2026'],
    ])
  })

  it('keeps empty fields and a last line without a line break', () => {
    expect(parseCsv('a,,c\n1,,')).toEqual([
      ['a', '', 'c'],
      ['1', '', ''],
    ])
  })
})

describe('csvRecords', () => {
  it('keys cells by their lower-case header', () => {
    expect(csvRecords('TYPE,CONTENT\ntask, Buy milk \n')).toEqual([
      { type: 'task', content: 'Buy milk' },
    ])
  })
})
