import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { rateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { BARIO_ONE_CALL_LOG_ORG_IDS, findOrCreateBoCustomerByEmail, logBoWebLeadNote } from '@/lib/barioOneCrmCallLog'
import { checkBookingSpacing, type ExistingAppointment } from '@/lib/hydroblastersBooking'
import { errorResponse } from '@/lib/errors'
import type { BoServiceCatalogItem } from '@/lib/db'

// HydroBlasters' real booking-confirmation endpoint — separate from the
// shared /api/public/site-lead (which just logs a CRM note) because this
// one has to do real scheduling math: look up the selected catalog items'
// real prices/durations, enforce the 72h/short-job spacing rule against
// actual existing bo_appointments, and only then create a real
// bo_customers + bo_deals + bo_appointments row. AFC/Sunbuilt's simpler
// contact-style forms don't need any of this, hence staying on site-lead.
const ORG_ID = BARIO_ONE_CALL_LOG_ORG_IDS.hydroblasters

// CORS-open — called cross-origin from hydroblasters.bario.ca (and later
// hydroblasters.ca) to www.bario.ca, same as every other /api/public/* route.
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  try {
    if (!ORG_ID) return json({ error: 'Booking is not configured' }, 500)
    const sql = await db()

    const ipOk = await rateLimit(sql, `hydro-book:ip:${clientIp(req)}`, 10, 60 * 60)
    if (!ipOk) {
      const res = rateLimitResponse()
      Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v))
      return res
    }

    const body = await req.json()
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : ''
    const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 200) : ''
    const phone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 40) : ''
    const address = typeof body?.address === 'string' ? body.address.trim().slice(0, 400) : ''
    const itemInfo = typeof body?.itemInfo === 'string' ? body.itemInfo.trim().slice(0, 400) : ''
    const catalogItemIds = Array.isArray(body?.catalogItemIds) ? body.catalogItemIds.filter((x: any) => typeof x === 'string') : []
    const preferredDateTime = typeof body?.preferredDateTime === 'string' ? body.preferredDateTime : ''
    const extraNotes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 1000) : ''

    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'A valid name and email are required' }, 400)
    if (!phone) return json({ error: 'Phone number is required' }, 400)
    if (catalogItemIds.length === 0) return json({ error: 'Select at least one service' }, 400)
    if (!preferredDateTime) return json({ error: 'Preferred date/time is required' }, 400)

    const candidateStart = new Date(preferredDateTime)
    if (isNaN(candidateStart.getTime()) || candidateStart.getTime() < Date.now()) {
      return json({ error: 'Please choose a valid future date/time' }, 400)
    }

    const items = (await sql`
      SELECT * FROM bo_service_catalog WHERE organization_id = ${ORG_ID} AND id = ANY(${catalogItemIds}) AND active = true
    `) as unknown as BoServiceCatalogItem[]
    if (items.length === 0) return json({ error: 'Selected service(s) not found' }, 400)

    const requiresQuote = items.some((i) => i.price_type === 'custom_quote')
    const totalCents = requiresQuote ? null : items.reduce((sum, i) => sum + (i.price_cents ?? 0), 0)
    // Fallback duration for an item with no estimate on file — errs toward
    // the safe/long side so we never accidentally under-book a slot.
    const totalDurationHours = items.reduce((sum, i) => sum + (i.estimated_duration_hours ?? 4), 0)
    const candidateEnd = new Date(candidateStart.getTime() + totalDurationHours * 60 * 60 * 1000)

    const existingRows = (await sql`
      SELECT starts_at, ends_at FROM bo_appointments
      WHERE organization_id = ${ORG_ID} AND status != 'cancelled'
        AND starts_at BETWEEN ${candidateStart}::timestamptz - interval '10 days' AND ${candidateStart}::timestamptz + interval '10 days'
    `) as unknown as { starts_at: string; ends_at: string | null }[]
    const existing: ExistingAppointment[] = existingRows
      .filter((r) => r.ends_at)
      .map((r) => ({ startsAt: new Date(r.starts_at), endsAt: new Date(r.ends_at as string) }))

    const availability = checkBookingSpacing(candidateStart, totalDurationHours, existing)
    if (!availability.allowed) {
      return json({ error: availability.reason }, 409)
    }

    const customerId = await findOrCreateBoCustomerByEmail(sql, ORG_ID, email, name, phone)
    if (!customerId) return json({ error: 'Could not create customer record' }, 500)

    const serviceNames = items.map((i) => (i.subcategory ? `${i.name} (${i.subcategory})` : i.name))
    const dealTitle = serviceNames[0] ?? 'Booking'
    const dealId = randomUUID()
    await sql`
      INSERT INTO bo_deals (id, organization_id, customer_id, title, stage, value_cents, notes)
      VALUES (${dealId}, ${ORG_ID}, ${customerId}, ${dealTitle}, 'lead', ${totalCents ?? 0}, ${extraNotes || null})
    `

    const appointmentId = randomUUID()
    await sql`
      INSERT INTO bo_appointments (id, organization_id, customer_id, deal_id, title, location, starts_at, ends_at, status, notes)
      VALUES (
        ${appointmentId}, ${ORG_ID}, ${customerId}, ${dealId}, ${dealTitle}, ${address || null},
        ${candidateStart}, ${candidateEnd}, 'scheduled',
        ${['Services: ' + serviceNames.join(', '), itemInfo ? `Asset: ${itemInfo}` : null, extraNotes || null].filter(Boolean).join('\n')}
      )
    `

    const noteLines = [
      `Services: ${serviceNames.join(', ')}`,
      itemInfo ? `Asset: ${itemInfo}` : null,
      address ? `Address: ${address}` : null,
      requiresQuote ? 'Pricing: requires custom quote' : `Estimated total: $${((totalCents ?? 0) / 100).toFixed(2)} + GST`,
      `Requested: ${candidateStart.toISOString()}`,
      extraNotes || null,
    ].filter(Boolean)
    await logBoWebLeadNote(sql, ORG_ID, customerId, 'Booking Wizard', noteLines.join('\n'))

    return json({
      ok: true,
      appointmentId,
      startsAt: candidateStart.toISOString(),
      endsAt: candidateEnd.toISOString(),
      totalCents,
      requiresQuote,
    })
  } catch (err) {
    const res = errorResponse(err)
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v))
    return res
  }
}
