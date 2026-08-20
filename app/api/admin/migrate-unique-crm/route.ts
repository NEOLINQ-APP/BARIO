import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// One-time, throwaway migration route — safe to remove after use. Same
// shape as app/api/admin/bario-one/organizations/[id]/import-crm/route.ts,
// but sourced from data pulled directly via psql (unique-crm-stack's
// public GraphQL endpoint has no nginx/cert in front of it anymore, so the
// normal import-crm route can't reach it) rather than through GraphQL.
// Only the 3 real people (Sherwin/Mya/Julianna, created by Victoria's own
// call-logging) — Twenty's 5 default demo-seed contacts (Brian
// Chesky/Dario Amodei/etc.) are deliberately excluded.
const ORG_ID = 'f7e3dc4b-fb3c-41eb-a24d-6339491c927c' // Unique Group Inc.

const PEOPLE = [
  { id: 'a878cee9-6602-43f4-b780-7b6c6737df38', name: 'Mr. Mendoza', phone: '+17802410880' },
  { id: '7a5a02c4-fc6b-4e1f-b837-fcf5da497ea2', name: 'Mya', phone: '+17809079755' },
  { id: 'eabd00e4-64f3-460e-8d8a-8fcb0b76d425', name: 'Julianna', phone: '+18254592955' },
]

const NOTES = [
  { personId: 'a878cee9-6602-43f4-b780-7b6c6737df38', title: 'Victoria call (outbound-api) — Aug 16, 2026, 2:09 a.m.', body: "A caller reached Unique Group Inc.'s live line but appeared to be stuck in a voicemail system menu, repeatedly hearing automated prompts rather than engaging in actual conversation.", createdAt: '2026-08-16 08:09:43.987949+00' },
  { personId: 'a878cee9-6602-43f4-b780-7b6c6737df38', title: 'Victoria call (inbound) — Aug 16, 2026, 1:52 p.m.', body: 'Mr. Mendoza called to check if his kids had called, and asked to send them messages saying he misses them and wants them to call.\n\nCasual and straightforward caller, focused on family communication. No notable personality quirks or concerns.', createdAt: '2026-08-16 19:52:17.216694+00' },
  { personId: 'a878cee9-6602-43f4-b780-7b6c6737df38', title: 'Victoria call (inbound) — Aug 16, 2026, 2:16 p.m.', body: "Mr. Mendoza called on behalf of Miles who is in Greece and needs to contact someone in Paris who speaks only French; requested translation assistance and asked to text Mya to check her Snapchat.\n\nPolite and straightforward, easily accepted alternative solutions when translation service wasn't available.", createdAt: '2026-08-16 20:16:15.56854+00' },
  { personId: '7a5a02c4-fc6b-4e1f-b837-fcf5da497ea2', title: 'Victoria call (outbound-api) — Aug 17, 2026, 11:34 a.m.', body: "A caller relayed a message from Mya's father expressing that he misses and loves her; Mya reciprocated the sentiment and thanked the caller for facilitating the call.", createdAt: '2026-08-17 17:34:09.41481+00' },
  { personId: 'a878cee9-6602-43f4-b780-7b6c6737df38', title: 'Victoria call (inbound) — Aug 17, 2026, 11:34 a.m.', body: 'Matthew Mendoza called to check if his kids had called and to inquire about missed calls; was informed that his daughter Mya had called that morning.\n\nPolite and appreciative. Seems to value family connection and was reassured to learn his daughter had called.', createdAt: '2026-08-17 17:34:49.119265+00' },
  { personId: 'eabd00e4-64f3-460e-8d8a-8fcb0b76d425', title: 'Victoria call (outbound-api) — Aug 17, 2026, 11:35 a.m.', body: 'Victoria left a voicemail for Julianna on behalf of her father, conveying that he misses and loves her and requesting a callback.', createdAt: '2026-08-17 17:35:29.685678+00' },
]

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const twentyIdToCustomerId = new Map<string, string>()
    let imported = 0
    let skipped = 0

    for (const person of PEOPLE) {
      const existing = (await sql`
        SELECT id FROM bo_customers WHERE organization_id = ${ORG_ID} AND contact_name = ${person.name} AND phone = ${person.phone}
      `) as unknown as { id: string }[]
      if (existing[0]) {
        twentyIdToCustomerId.set(person.id, existing[0].id)
        skipped++
        continue
      }
      const customerId = randomUUID()
      await sql`
        INSERT INTO bo_customers (id, organization_id, company_name, contact_name, phone, email, tags_json, created_at)
        VALUES (${customerId}, ${ORG_ID}, ${null}, ${person.name}, ${person.phone}, ${null}, ${JSON.stringify(['migrated-from-twenty', 'victoria-call-log'])}, now())
      `
      twentyIdToCustomerId.set(person.id, customerId)
      imported++
    }

    let notesImported = 0
    for (const note of NOTES) {
      const customerId = twentyIdToCustomerId.get(note.personId)
      if (!customerId) continue
      const body = `${note.title}\n\n${note.body}`
      await sql`
        INSERT INTO bo_notes (id, organization_id, customer_id, kind, body, created_at)
        VALUES (${randomUUID()}, ${ORG_ID}, ${customerId}, 'note', ${body}, ${note.createdAt})
      `
      notesImported++
    }

    return NextResponse.json({ ok: true, imported, skipped, notesImported })
  } catch (err) {
    return errorResponse(err)
  }
}
