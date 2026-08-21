import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { parseContactsFile, type ParsedContact } from '@/lib/contactImportParser'
import { errorResponse } from '@/lib/errors'

// Same single-operator gating as app/api/victoria/app/chat/route.ts — this
// writes into Sherwin's own personal contacts list, not a shared resource.
const OWNER_EMAIL = 'uniquegroup.org@gmail.com'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // a phone address book export is at most a few hundred KB of text; this is generous headroom, not a real limit
const MAX_CONTACTS_PER_IMPORT = 2000 // sanity ceiling — a real personal export won't come close

async function importContactsOnVps(contacts: ParsedContact[]): Promise<{ ok: boolean; imported?: number; skipped?: number; error?: string }> {
  const secret = process.env.INTERNAL_API_SECRET
  if (!secret) return { ok: false, error: 'INTERNAL_API_SECRET not set' }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://miko-voice.bario.ca/internal/contacts/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
        body: JSON.stringify({ personKey: 'sherwin', contacts }),
      })
      if (res.ok) return await res.json()
      console.error('importContactsOnVps failed', attempt, res.status, await res.text().catch(() => ''))
    } catch (err) {
      console.error('importContactsOnVps threw', attempt, err)
    }
  }
  return { ok: false, error: 'Could not reach Victoria to import contacts' }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || user.email.toLowerCase() !== OWNER_EMAIL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contentType = req.headers.get('content-type') || ''
    let contacts: ParsedContact[]

    if (contentType.includes('application/json')) {
      // Android's Contact Picker API path — the browser already returns
      // structured {name, tel[]} entries, no file/parsing involved.
      const body = await req.json().catch(() => ({}))
      const picked = Array.isArray(body?.contacts) ? body.contacts : []
      contacts = picked
        .map((c: any) => ({ name: String(c?.name || '').trim(), phoneNumber: String(c?.phoneNumber || '').trim() }))
        .filter((c: ParsedContact) => c.name && c.phoneNumber)
    } else {
      const form = await req.formData().catch(() => null)
      const file = form?.get('file')
      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: 'File too large' }, { status: 400 })
      }
      const raw = await file.text()
      contacts = parseContactsFile(raw)
    }

    if (contacts.length === 0) {
      return NextResponse.json({ error: "Couldn't find any contacts with both a name and phone number in that file" }, { status: 400 })
    }
    if (contacts.length > MAX_CONTACTS_PER_IMPORT) {
      contacts = contacts.slice(0, MAX_CONTACTS_PER_IMPORT)
    }

    const result = await importContactsOnVps(contacts)
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Import failed' }, { status: 502 })
    }

    return NextResponse.json({ imported: result.imported ?? 0, skipped: result.skipped ?? 0, total: contacts.length })
  } catch (err) {
    return errorResponse(err)
  }
}
