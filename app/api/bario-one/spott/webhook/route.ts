import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { linkOrCreateContactFromSpottLead } from '@/lib/spottIntegration'
import { recordLeadSource } from '@/lib/leadAttribution'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import { errorResponse } from '@/lib/errors'

// Public/unauthenticated by design (Spott has no BARIO session to send) —
// this route verifies the request itself via the t=,v1= HMAC scheme
// (mirrors stripe.server.ts on Spott's side, NOT triggerWebhooks()'s own
// outbound scheme — those are deliberately separate conventions). Looks
// the sender up by spott_listings.external_spott_id (the payload's
// business_id) rather than trusting the payload's own org id, so a
// forged external_org_id can't be used to guess a signing secret.
export const dynamic = 'force-dynamic'

async function verifySignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false
  let timestamp: string | undefined
  let v1: string | undefined
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2)
    if (k === 't') timestamp = v
    if (k === 'v1') v1 = v
  }
  if (!timestamp || !v1) return false
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`))
  const expected = Array.from(new Uint8Array(signed)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return expected === v1
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    let payload: {
      event_id: string
      event_type: string
      business_id: string
      external_org_id: string
      data: Record<string, any>
    }
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (!payload?.event_id || !payload.event_type || !payload.business_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const sql = await db()

    const listingRows = (await sql`
      SELECT l.id AS listing_id, l.organization_id, c.webhook_signing_secret
      FROM spott_listings l
      JOIN spott_connection_credentials c ON c.listing_id = l.id
      WHERE l.external_spott_id = ${payload.business_id} AND l.sync_status != 'not_connected'
    `) as unknown as { listing_id: string; organization_id: string; webhook_signing_secret: string }[]
    const conn = listingRows[0]
    if (!conn) return NextResponse.json({ error: 'No matching connection' }, { status: 404 })

    const signatureHeader = req.headers.get('x-spott-signature')
    const validSig = await verifySignature(rawBody, signatureHeader, conn.webhook_signing_secret)
    if (!validSig) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

    // Idempotency — Spott's own worker WILL redeliver on a timeout/5xx even
    // after this side already processed the event.
    const existing = (await sql`SELECT id FROM spott_webhook_events WHERE id = ${payload.event_id}`) as unknown as { id: string }[]
    if (existing.length > 0) return NextResponse.json({ ok: true, deduped: true })

    const orgId = conn.organization_id
    const listingId = conn.listing_id

    if (payload.event_type === 'lead.created') {
      const lead = payload.data?.lead
      if (lead?.id) {
        const customerId = await linkOrCreateContactFromSpottLead(sql, orgId, {
          contactName: lead.name ?? null,
          phone: lead.phone ?? null,
          email: lead.email ?? null,
        })

        let promotionId: string | null = null
        if (lead.promotion_id) {
          const promoRows = (await sql`SELECT id FROM spott_promotions WHERE organization_id = ${orgId} AND external_promotion_id = ${lead.promotion_id}`) as unknown as { id: string }[]
          promotionId = promoRows[0]?.id ?? null
        }

        const leadId = randomUUID()
        await sql`
          INSERT INTO spott_leads (id, organization_id, listing_id, customer_id, promotion_id, external_lead_id, contact_name, phone, email, message, created_at)
          VALUES (${leadId}, ${orgId}, ${listingId}, ${customerId}, ${promotionId}, ${lead.id}, ${lead.name ?? null}, ${lead.phone ?? null}, ${lead.email ?? null}, ${lead.message ?? null}, ${lead.created_at ?? new Date().toISOString()})
          ON CONFLICT (organization_id, external_lead_id) WHERE external_lead_id IS NOT NULL DO NOTHING
        `

        if (customerId) {
          await recordLeadSource(sql, customerId, {
            source: 'spott',
            sourceDetail: lead.source ?? 'spott_listing',
            utmSource: lead.utm_source ?? null,
            utmMedium: lead.utm_medium ?? null,
            utmCampaign: lead.utm_campaign ?? null,
            landingPage: lead.landing_page ?? null,
            referrer: lead.referrer ?? null,
          })
          await sql`
            INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
            VALUES (${randomUUID()}, ${orgId}, ${customerId}, 'spott', ${`New Spott lead\n\n${lead.message ?? '(no message)'}`})
          `
        }

        await triggerWebhooks(sql, orgId, 'spott.lead_created', { leadId, customerId, spottLeadId: lead.id })
      }
    } else if (payload.event_type === 'review.created') {
      const review = payload.data?.review
      if (review?.id) {
        const reviewId = randomUUID()
        await sql`
          INSERT INTO spott_reviews (id, organization_id, listing_id, external_review_id, rating, body, owner_reply, owner_reply_at, created_at)
          VALUES (${reviewId}, ${orgId}, ${listingId}, ${review.id}, ${review.rating ?? null}, ${review.body ?? null}, ${review.owner_reply ?? null}, ${review.owner_reply_at ?? null}, ${review.created_at ?? new Date().toISOString()})
          ON CONFLICT (organization_id, external_review_id) WHERE external_review_id IS NOT NULL
          DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, owner_reply = EXCLUDED.owner_reply, owner_reply_at = EXCLUDED.owner_reply_at
        `
        await triggerWebhooks(sql, orgId, 'review.created', { reviewId, spottReviewId: review.id, rating: review.rating })
      }
    } else if (payload.event_type === 'listing.updated') {
      const listing = payload.data?.listing
      if (listing) {
        await sql`
          UPDATE spott_listings SET
            name = ${listing.name ?? null},
            public_url = ${listing.public_url ?? null},
            description = ${listing.description ?? null},
            phone = ${listing.phone ?? null},
            email = ${listing.email ?? null},
            website = ${listing.website ?? null},
            address = ${listing.address ?? null},
            hours_json = ${listing.hours ? JSON.stringify(listing.hours) : null},
            hero_image_url = ${listing.hero_image_url ?? null},
            sync_status = 'synced',
            last_synced_at = now(),
            updated_at = now()
          WHERE id = ${listingId}
        `
        await triggerWebhooks(sql, orgId, 'spott.listing_updated', { listingId })
      }
    }

    await sql`INSERT INTO spott_webhook_events (id, organization_id, event_type) VALUES (${payload.event_id}, ${orgId}, ${payload.event_type})`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
