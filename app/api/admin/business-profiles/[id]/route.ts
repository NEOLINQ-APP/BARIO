import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { parseBusinessProfile } from '@/lib/businessProfile'
import { errorResponse } from '@/lib/errors'
import type { BusinessProfileRow } from '@/lib/db'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM business_profiles WHERE id = ${params.id}`) as unknown as BusinessProfileRow[]
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, profile: parseBusinessProfile(rows[0]) })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM business_profiles WHERE id = ${params.id}`) as unknown as BusinessProfileRow[]
    const existing = rows[0]
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))

    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : existing.name
    const about = typeof body?.about === 'string' ? body.about.trim() : existing.about
    const hours = body?.hours !== undefined ? (typeof body.hours === 'string' && body.hours.trim() ? body.hours.trim() : null) : existing.hours
    const policies = body?.policies !== undefined ? (typeof body.policies === 'string' && body.policies.trim() ? body.policies.trim() : null) : existing.policies
    const pricingNotes = body?.pricingNotes !== undefined ? (typeof body.pricingNotes === 'string' && body.pricingNotes.trim() ? body.pricingNotes.trim() : null) : existing.pricing_notes
    const services = Array.isArray(body?.services) ? JSON.stringify(body.services) : existing.services_json
    const serviceArea = Array.isArray(body?.serviceArea) ? JSON.stringify(body.serviceArea) : existing.service_area_json
    const employees = Array.isArray(body?.employees) ? JSON.stringify(body.employees) : existing.employees_json
    const faq = Array.isArray(body?.faq) ? JSON.stringify(body.faq) : existing.faq_json

    await sql`
      UPDATE business_profiles SET
        name = ${name}, about = ${about}, hours = ${hours}, policies = ${policies}, pricing_notes = ${pricingNotes},
        services_json = ${services}, service_area_json = ${serviceArea}, employees_json = ${employees}, faq_json = ${faq},
        updated_at = now()
      WHERE id = ${params.id}
    `

    await logAdminAction(sql, { action: 'business-profile-updated', params: { id: params.id }, result: 'ok', triggeredBy: 'admin' })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
