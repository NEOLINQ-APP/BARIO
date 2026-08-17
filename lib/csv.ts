// Minimal, correct CSV writer — quotes any field containing a comma,
// quote, or newline, and escapes embedded quotes by doubling them (the
// standard RFC 4180 rule). Good enough for "export my data to import into
// my accounting software," not meant to be a full CSV library.
function csvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string {
  const headerLine = columns.map((c) => csvField(c.header)).join(',')
  const lines = rows.map((row) => columns.map((c) => csvField(row[c.key])).join(','))
  return [headerLine, ...lines].join('\r\n')
}

// Minimal, correct RFC 4180 reader to match toCsv()'s writer -- handles
// quoted fields (with embedded commas/newlines) and doubled-quote escaping.
// Returns rows of raw string cells; the caller maps them to real columns
// via the header row (first row) rather than this function assuming any
// particular schema.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // Normalize line endings up front so \r\n / \r / \n all behave the same
  // inside the state machine below.
  const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  // Flush the final field/row if the input didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Drop trailing fully-empty rows (a common artifact of a trailing
  // newline in the uploaded file).
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}
