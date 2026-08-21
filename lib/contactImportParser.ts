// Parses a phone contacts export into a flat {name, phoneNumber}[] — no
// external dependency, since both formats this needs to handle are bounded
// and well-understood. vCard (.vcf) is the primary target: both iPhone's
// Contacts app ("Share Contact" / "Export vCard") and Android's Contacts
// app produce it natively, so it covers "both / not sure yet" without
// picking a platform. Basic CSV support (Google Contacts' export format)
// is a fallback for anyone exporting that way instead.

export type ParsedContact = { name: string; phoneNumber: string }

// vCard allows folded (wrapped) lines: a continuation line starts with a
// single space or tab and should be joined to the previous line with the
// fold character removed, per RFC 6350 §3.2. Real exports from Contacts
// apps do this for nothing we care about (FN/TEL are short), but unfolding
// first is cheap insurance against a parser silently truncating a name.
function unfoldVCardLines(raw: string): string[] {
  const rawLines = raw.replace(/\r\n/g, '\n').split('\n')
  const lines: string[] = []
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

// A vCard property line looks like `KEY;PARAM=VALUE;PARAM2=VALUE2:actual value`
// — the real value is everything after the FIRST colon (params never
// contain one in practice for the properties we read here).
function splitVCardLine(line: string): { key: string; value: string } | null {
  const colonIndex = line.indexOf(':')
  if (colonIndex === -1) return null
  const keyPart = line.slice(0, colonIndex)
  const value = line.slice(colonIndex + 1).trim()
  const key = keyPart.split(';')[0].trim().toUpperCase()
  return { key, value }
}

export function parseVCard(raw: string): ParsedContact[] {
  const lines = unfoldVCardLines(raw)
  const contacts: ParsedContact[] = []
  let currentName: string | null = null
  let currentStructuredName: string | null = null
  let currentPhone: string | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.toUpperCase() === 'BEGIN:VCARD') {
      currentName = null
      currentStructuredName = null
      currentPhone = null
      continue
    }
    if (line.toUpperCase() === 'END:VCARD') {
      const name = (currentName || currentStructuredName || '').trim()
      if (name && currentPhone) contacts.push({ name, phoneNumber: currentPhone })
      continue
    }
    const parsed = splitVCardLine(line)
    if (!parsed) continue
    if (parsed.key === 'FN') {
      currentName = parsed.value
    } else if (parsed.key === 'N' && !currentStructuredName) {
      // N: LastName;FirstName;MiddleName;Prefix;Suffix — reconstruct as
      // "FirstName LastName" only as a fallback if FN is ever missing
      // (uncommon — FN is required by the vCard spec — but real-world
      // exports aren't always spec-compliant).
      const parts = parsed.value.split(';')
      const first = parts[1]?.trim() || ''
      const last = parts[0]?.trim() || ''
      currentStructuredName = [first, last].filter(Boolean).join(' ')
    } else if (parsed.key === 'TEL' && !currentPhone) {
      // First phone number wins — this feature is "one number to call/text
      // this person," not a full multi-number address book entry.
      currentPhone = parsed.value
    }
  }
  return contacts
}

// Minimal RFC4180-ish CSV line splitter — handles quoted fields containing
// commas, doesn't attempt full RFC compliance (embedded newlines inside a
// quoted field) since real contact-export CSVs don't produce those.
function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

export function parseContactsCsv(raw: string): ParsedContact[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())

  const nameIdx = headers.findIndex((h) => h === 'name' || h === 'full name' || h.includes('display name'))
  const firstIdx = headers.findIndex((h) => h.includes('first name'))
  const lastIdx = headers.findIndex((h) => h.includes('last name'))
  const phoneIdxs = headers.map((h, i) => ((h.includes('phone') || h.includes('mobile') || h.includes('tel')) ? i : -1)).filter((i) => i !== -1)

  const contacts: ParsedContact[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i])
    let name = nameIdx !== -1 ? fields[nameIdx]?.trim() : ''
    if (!name && (firstIdx !== -1 || lastIdx !== -1)) {
      name = [firstIdx !== -1 ? fields[firstIdx] : '', lastIdx !== -1 ? fields[lastIdx] : ''].filter(Boolean).join(' ').trim()
    }
    const phone = phoneIdxs.map((idx) => fields[idx]?.trim()).find((v) => v)
    if (name && phone) contacts.push({ name, phoneNumber: phone })
  }
  return contacts
}

// Auto-detects format by content rather than requiring the caller to know
// the file extension (a browser file picker's reported MIME type for .vcf
// is unreliable across platforms).
export function parseContactsFile(raw: string): ParsedContact[] {
  if (/BEGIN:VCARD/i.test(raw)) return parseVCard(raw)
  return parseContactsCsv(raw)
}
