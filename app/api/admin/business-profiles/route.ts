import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { parseBusinessProfile } from '@/lib/businessProfile'
import { errorResponse } from '@/lib/errors'
import type { BusinessProfileRow } from '@/lib/db'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM business_profiles ORDER BY name`) as unknown as BusinessProfileRow[]
    return NextResponse.json({ ok: true, profiles: rows.map(parseBusinessProfile) })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const lookupKey = typeof body?.lookupKey === 'string' && body.lookupKey.trim() ? body.lookupKey.trim().toLowerCase() : null
    const ownerUserId = typeof body?.ownerUserId === 'string' && body.ownerUserId.trim() ? body.ownerUserId.trim() : null

    const id = randomUUID()
    await sql`
      INSERT INTO business_profiles (id, owner_user_id, lookup_key, name, about, services_json, hours, service_area_json, employees_json, faq_json, policies, pricing_notes)
      VALUES (
        ${id}, ${ownerUserId}, ${lookupKey}, ${name},
        ${typeof body?.about === 'string' ? body.about.trim() : ''},
        ${JSON.stringify(Array.isArray(body?.services) ? body.services : [])},
        ${typeof body?.hours === 'string' && body.hours.trim() ? body.hours.trim() : null},
        ${JSON.stringify(Array.isArray(body?.serviceArea) ? body.serviceArea : [])},
        ${JSON.stringify(Array.isArray(body?.employees) ? body.employees : [])},
        ${JSON.stringify(Array.isArray(body?.faq) ? body.faq : [])},
        ${typeof body?.policies === 'string' && body.policies.trim() ? body.policies.trim() : null},
        ${typeof body?.pricingNotes === 'string' && body.pricingNotes.trim() ? body.pricingNotes.trim() : null}
      )
    `

    await logAdminAction(sql, { action: 'business-profile-created', params: { id, name, lookupKey }, result: 'ok', triggeredBy: 'admin' })

    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return errorResponse(err)
  }
}
