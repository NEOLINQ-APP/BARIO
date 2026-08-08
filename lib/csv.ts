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
