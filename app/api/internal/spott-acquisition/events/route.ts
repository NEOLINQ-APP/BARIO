import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { findDuplicateLead, recalculateLeadScore } from '@/lib/leadPipeline'
import { errorResponse } from '@/lib/errors'

// Public/unauthenticated by design (partner-secret verified below) — same
// server-to-server trust boundary as the Phase 2 CRM_PARTNER_SECRET, but
// a separate data flow: this is Bario's OWN internal sales pipeline for
// every Spott claim-invitation prospect, not a customer's connected CRM.
// Every claimed/prospective Spott business becomes one bo_customers row
// (company_name = business name) in the fixed "Spott Acquisition" org —
// reuses the exact dedup (findDuplicateLead) Phase 2's Spott lead intake
// already relies on, rather than a second matching implementation.
export const dynamic = 'force-dynamic'

async function getOrCreateAcquisitionCustomer(sql: any, orgId: string, businessId: string, name: string): Promise<string> {
  const existing = (await sql`
    SELECT id FROM bo_customers WHERE organization_id = ${orgId} AND tags_json::text LIKE ${'%"spott_business:' + businessId + '"%'}
  `) as unknown as { id: string }[]
  if (existing[0]) return existing[0].id

  const dup = await findDuplicateLead(sql, orgId, { companyName: name })
  if (dup) {
    await sql`UPDATE bo_customers SET tags_json = (tags_json::jsonb || ${JSON.stringify([`spott_business:${businessId}`])}::jsonb)::text WHERE id = ${dup.id}`
    return dup.id
  }

  const id = randomUUID()
  await sql`
    INSERT INTO bo_customers (id, organization_id, contact_name, company_name, tags_json, source)
    VALUES (${id}, ${orgId}, ${name}, ${name}, ${JSON.stringify(['spott', `spott_business:${businessId}`])}, 'spott_acquisition')
  `
  await recalculateLeadScore(sql, orgId, id)
  return id
}

export async function POST(req: Request) {
  try {
    const partnerSecret = req.headers.get('x-bario-partner-secret')
    if (!process.env.CRM_PARTNER_SECRET || partnerSecret !== process.env.CRM_PARTNER_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = process.env.SPOTT_ACQUISITION_ORG_ID
    if (!orgId) {
      // Honest no-op, per the user's own "skip if undecided" fallback —
      // never pretend to deliver to a destination that isn't configured.
      return NextResponse.json({ ok: true, skipped: 'SPOTT_ACQUISITION_ORG_ID not configured' })
    }

    const body = await req.json()
    const { event_type, business_id, data } = body as { event_type: string; business_id: string; data: Record<string, any> }
    if (!event_type || !business_id) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

    const sql = await db()
    const name = data?.name || 'Spott business'

    if (event_type === 'spott.business.created') {
      const customerId = await getOrCreateAcquisitionCustomer(sql, orgId, business_id, name)
      await sql`
        INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
        VALUES (${randomUUID()}, ${orgId}, ${customerId}, 'spott', ${`New Spott listing created: ${name} — invited to claim`})
      `
    } else if (event_type === 'spott.claim.started') {
      const customerId = await getOrCreateAcquisitionCustomer(sql, orgId, business_id, name)
      await sql`
        INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
        VALUES (${randomUUID()}, ${orgId}, ${customerId}, 'spott', ${`Opened their Spott claim invitation`})
      `
    } else if (event_type === 'spott.claim.completed') {
      const customerId = await getOrCreateAcquisitionCustomer(sql, orgId, business_id, name)
      await sql`UPDATE bo_customers SET current_priority = 'hot' WHERE id = ${customerId}`
      await sql`
        INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
        VALUES (${randomUUID()}, ${orgId}, ${customerId}, 'spott', ${`Claimed their Spott listing — real prospect for advertising/premium upsell`})
      `
    } else {
      // Forward-compatible: log and no-op for event types not yet handled
      // (spott.profile.updated / review.created / offer.created /
      // lead.created / subscription.created — real signal, not yet wired
      // to send from Spott in this pass; see the Phase E-equivalent
      // report's known limitations).
      console.log('spott-acquisition: unhandled event_type', event_type)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
