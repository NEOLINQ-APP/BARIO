import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { OUTREACH_CRMS, crmGraphQL } from '@/lib/crmOutreach'
import { errorResponse } from '@/lib/errors'

// Lists drafted outreach notes that are ready for a human to review and
// send — "ready" means the contact now has a real email address (from
// crm-email-enrich) and hasn't been sent yet. Deliberately read-only; the
// actual send is a separate explicit action (see ./send/route.ts).
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    // Per-crm try/catch: AFC's and Sunbuilt's standalone Twenty CRMs were
    // deleted 2026-08-18 (this whole draft-and-review pipeline was
    // exclusive to those two and has no Bario One CRM equivalent built
    // yet — see the new Leads & Campaigns admin panel for the replacement
    // capability). A GraphQL failure for one business must not wipe out
    // another's still-working results.
    const results = []
    for (const crm of OUTREACH_CRMS) {
      try {
        const draftedRows = (await sql`
          SELECT person_id, note_id, scheduled_at FROM crm_leadgen_drafted
          WHERE crm_key = ${crm.key} AND sent_at IS NULL AND note_id IS NOT NULL
        `) as unknown as { person_id: string; note_id: string; scheduled_at: string | null }[]
        if (draftedRows.length === 0) {
          results.push({ crm: crm.key, businessName: crm.businessName, ready: [] })
          continue
        }

        const noteIds = draftedRows.map((r) => r.note_id)
        const [notesData, peopleData] = await Promise.all([
          crmGraphQL(crm, `query($ids: [UUID!]) { notes(filter: {id: {in: $ids}}) { edges { node { id title bodyV2 { markdown } } } } }`, { ids: noteIds }),
          crmGraphQL(crm, `query { people(first: 500) { edges { node { id name { firstName lastName } emails { primaryEmail } phones { primaryPhoneNumber primaryPhoneCallingCode } company { name } } } } }`, {}),
        ])
        const notesById = new Map((notesData?.notes?.edges ?? []).map((e: any) => [e.node.id, e.node]))
        const peopleById = new Map((peopleData?.people?.edges ?? []).map((e: any) => [e.node.id, e.node]))

        const ready = []
        for (const row of draftedRows) {
          const person = peopleById.get(row.person_id) as any
          const note = notesById.get(row.note_id) as any
          const email = person?.emails?.primaryEmail
          if (!email || !note) continue
          const phone = person?.phones?.primaryPhoneNumber
            ? `${person.phones.primaryPhoneCallingCode ?? ''}${person.phones.primaryPhoneNumber}`
            : null
          ready.push({
            personId: row.person_id,
            noteId: row.note_id,
            companyName: person.company?.name ?? person.name?.lastName ?? 'Unknown',
            email,
            phone,
            subject: note.title?.replace(/^BARIO Draft: /, '') ?? 'Outreach',
            body: note.bodyV2?.markdown ?? '',
            scheduledAt: row.scheduled_at,
          })
        }
        results.push({ crm: crm.key, businessName: crm.businessName, ready })
      } catch (err) {
        console.error(`Failed to load pending outreach for ${crm.key}`, err)
        results.push({ crm: crm.key, businessName: crm.businessName, ready: [] })
      }
    }
    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return errorResponse(err)
  }
}
