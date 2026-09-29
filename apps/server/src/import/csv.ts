const BYTE_ORDER_MARK = 0xfeff

/**
 * Parses CSV as spreadsheets and to-do apps write it: quoted fields with
 * doubled quotes, line breaks inside quotes, a byte order mark, and either
 * commas or semicolons (German Excel and Outlook) as the separator.
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text
  const delimiter = detectDelimiter(input)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < input.length; index++) {
    const char = input[index]!
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
    } else if (char === '"' && field === '') {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Blank lines carry no data.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

/** The separator used in the first line, outside of quotes. */
function detectDelimiter(input: string): ',' | ';' {
  let commas = 0
  let semicolons = 0
  let quoted = false
  for (const char of input) {
    if (char === '"') quoted = !quoted
    else if (!quoted && (char === '\n' || char === '\r')) break
    else if (!quoted && char === ',') commas++
    else if (!quoted && char === ';') semicolons++
  }
  return semicolons > commas ? ';' : ','
}

/** Rows as objects keyed by the (trimmed, lower-cased) header of each column. */
export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text)
  if (!header) return []
  const keys = header.map((name) => name.trim().toLowerCase())
  return rows.map((cells) => {
    const record: Record<string, string> = {}
    keys.forEach((key, index) => {
      record[key] = (cells[index] ?? '').trim()
    })
    return record
  })
}
