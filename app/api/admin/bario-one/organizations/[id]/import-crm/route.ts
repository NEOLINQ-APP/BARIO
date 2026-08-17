import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { findCrm, crmGraphQL } from '@/lib/crmOutreach'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'
import type { BoOrganization } from '@/lib/db'

// One-time (safe to re-run — skips people already imported by email/name)
// migration of a Twenty CRM instance's People + their Notes into a Bario
// One organization's own bo_customers/bo_notes. Deliberately does NOT touch
// or delete anything in Twenty — this is a copy, not a cutover, so the
// Twenty instance stays exactly as-is as a fallback until it's decommissioned
// separately, later, on purpose.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { crmKey } = await req.json()
    const crm = findCrm(crmKey)
    if (!crm) return NextResponse.json({ error: `Unknown CRM key: ${crmKey}` }, { status: 400 })

    const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${params.id}`) as unknown as BoOrganization[]
    const org = orgRows[0]
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    // Pull every person + their company name, and every note + who it's
    // targeted at, in two bulk queries rather than N+1 per-person calls.
    const peopleData = await crmGraphQL(
      crm,
      `query { people(first: 1000) { edges { node {
        id
        name { firstName lastName }
        company { name }
        emails { primaryEmail }
        phones { primaryPhoneNumber }
      } } } }`,
      {}
    )
    const notesData = await crmGraphQL(
      crm,
      `query { notes(first: 2000) { edges { node {
        title
        bodyV2 { markdown }
        createdAt
        noteTargets { edges { node { targetPersonId } } }
      } } } }`,
      {}
    )

    const people: any[] = (peopleData?.people?.edges ?? []).map((e: any) => e.node)
    const notes: any[] = (notesData?.notes?.edges ?? []).map((e: any) => e.node)

    const notesByPersonId = new Map<string, { title: string; body: string; createdAt: string }[]>()
    for (const note of notes) {
      const targets: string[] = (note.noteTargets?.edges ?? []).map((e: any) => e.node?.targetPersonId).filter(Boolean)
      for (const personId of targets) {
        const list = notesByPersonId.get(personId) ?? []
        list.push({ title: note.title ?? '', body: note.bodyV2?.markdown ?? '', createdAt: note.createdAt })
        notesByPersonId.set(personId, list)
      }
    }

    const existingRows = (await sql`SELECT id, contact_name, email FROM bo_customers WHERE organization_id = ${org.id}`) as unknown as { id: string; contact_name: string; email: string | null }[]
    const existingByKey = new Map(existingRows.map((r) => [`${r.contact_name.trim().toLowerCase()}|${(r.email ?? '').trim().toLowerCase()}`, r.id]))
    const noteCountRows = (await sql`
      SELECT customer_id, count(*)::int AS c FROM bo_notes WHERE organization_id = ${org.id} GROUP BY customer_id
    `) as unknown as { customer_id: string; c: number }[]
    const hasNotes = new Set(noteCountRows.filter((r) => r.c > 0).map((r) => r.customer_id))

    let imported = 0
    let skipped = 0
    let notesImported = 0

    for (const person of people) {
      const firstName = person.name?.firstName?.trim() ?? ''
      const lastName = person.name?.lastName?.trim() ?? ''
      const contactName = `${firstName} ${lastName}`.trim() || 'Unknown'
      const email = person.emails?.primaryEmail?.trim() || null
      const key = `${contactName.toLowerCase()}|${(email ?? '').toLowerCase()}`

      let customerId = existingByKey.get(key)
      if (customerId) {
        skipped++
      } else {
        customerId = randomUUID()
        await sql`
          INSERT INTO bo_customers (id, organization_id, company_name, contact_name, phone, email, tags_json, created_at)
          VALUES (
            ${customerId}, ${org.id},
            ${person.company?.name || null},
            ${contactName},
            ${person.phones?.primaryPhoneNumber || null},
            ${email},
            ${JSON.stringify(['migrated-from-twenty'])},
            now()
          )
        `
        imported++
        existingByKey.set(key, customerId)
      }

      // Backfill notes even for a customer that already existed (e.g. a
      // prior run before note-target field mapping was fixed) — but only
      // if they don't already have any, so re-running this never duplicates.
      if (hasNotes.has(customerId)) continue
      const personNotes = notesByPersonId.get(person.id) ?? []
      for (const note of personNotes) {
        const body = note.title ? `${note.title}\n\n${note.body}` : note.body
        if (!body?.trim()) continue
        await sql`
          INSERT INTO bo_notes (id, organization_id, customer_id, kind, body, created_at)
          VALUES (${randomUUID()}, ${org.id}, ${customerId}, 'note', ${body}, ${note.createdAt || new Date().toISOString()})
        `
        notesImported++
      }
      if (personNotes.length > 0) hasNotes.add(customerId)
    }

    await logAdminAction(sql, {
      action: 'bario_one_import_crm',
      params: { orgId: org.id, crmKey, imported, skipped, notesImported, totalPeopleInTwenty: people.length },
      result: 'ok',
    })

    return NextResponse.json({ ok: true, imported, skipped, notesImported, totalPeopleInTwenty: people.length })
  } catch (err) {
    return errorResponse(err)
  }
}
