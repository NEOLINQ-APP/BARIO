import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { findCrm, findOrCreatePersonByEmail, logWebLeadNote } from '@/lib/crmOutreach'
import { rateLimit } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

// Genuinely public, unauthenticated — called client-side by a client's own
// customer-facing site (sunbuiltgroup.com, afclogistics.ca) so a real
// visitor's estimate/contact/signup submission reaches that business's real
// Twenty CRM instead of vanishing into the site's own browser-local storage
// (the bug this route exists to fix). Protected by a businessKey whitelist
// (only real client CRMs we've wired up) + per-IP rate limiting rather than
// auth, since a real anonymous visitor has no Bario session.
const ALLOWED_BUSINESS_KEYS = new Set(['afc', 'sunbuilt'])
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  try {
    const sql = await db()

    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const body = await req.json().catch(() => ({}))
    const businessKey = typeof body?.businessKey === 'string' ? body.businessKey : ''
    if (!ALLOWED_BUSINESS_KEYS.has(businessKey)) {
      return NextResponse.json({ error: 'Unknown business' }, { status: 400, headers: CORS_HEADERS })
    }

    const allowed = await rateLimit(sql, `site-lead:${businessKey}:${ip}`, 20, 3600)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: CORS_HEADERS })
    }

    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : ''
    const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 200) : ''
    const phone = typeof body?.phone === 'string' && body.phone.trim() ? body.phone.trim().slice(0, 40) : null
    const service = typeof body?.service === 'string' ? body.service.trim().slice(0, 200) : ''
    const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 2000) : ''
    const source = typeof body?.source === 'string' && body.source.trim() ? body.source.trim().slice(0, 100) : 'Website'
    const priceRange = typeof body?.priceRange === 'string' ? body.priceRange.trim().slice(0, 100) : ''

    if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'A valid name and email are required' }, { status: 400, headers: CORS_HEADERS })
    }

    const crm = findCrm(businessKey)
    if (!crm) return NextResponse.json({ error: 'Unknown business' }, { status: 400, headers: CORS_HEADERS })

    const personId = await findOrCreatePersonByEmail(crm, email, name, phone)
    if (personId) {
      const lines = [
        `Source: ${source}`,
        service ? `Service: ${service}` : null,
        priceRange ? `Estimated range: ${priceRange}` : null,
        phone ? `Phone: ${phone}` : null,
        notes ? `Notes: ${notes}` : null,
      ].filter(Boolean)
      await logWebLeadNote(crm, personId, source, lines.join('\n'))
    }

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (err) {
    const res = errorResponse(err)
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v))
    return res
  }
}
