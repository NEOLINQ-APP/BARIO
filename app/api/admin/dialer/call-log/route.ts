import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Bario Dialer's call history. The call itself happens entirely
// browser-to-Twilio (Voice SDK/WebRTC) — this just logs it from the
// client at the two real lifecycle moments: POST when a call starts,
// PATCH when it ends with however long it actually ran.
export async function GET(req: Request) {
  const adminOrRes = await requireAdmin(req)
  if (adminOrRes instanceof NextResponse) return adminOrRes
  try {
    const url = new URL(req.url)
    const businessKey = url.searchParams.get('businessKey')
    const sql = adminOrRes.sql
    const rows = businessKey
      ? await sql`SELECT * FROM dialer_call_log WHERE business_key = ${businessKey} ORDER BY started_at DESC LIMIT 50`
      : await sql`SELECT * FROM dialer_call_log ORDER BY started_at DESC LIMIT 50`
    return NextResponse.json({ ok: true, calls: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const adminOrRes = await requireAdmin(req)
  if (adminOrRes instanceof NextResponse) return adminOrRes
  try {
    const body = await req.json().catch(() => ({}))
    const businessKey = typeof body?.businessKey === 'string' ? body.businessKey : null
    const toNumber = typeof body?.toNumber === 'string' ? body.toNumber : null
    const contactName = typeof body?.contactName === 'string' ? body.contactName : null
    if (!businessKey || !toNumber || !adminOrRes.user) {
      return NextResponse.json({ error: 'businessKey, toNumber are required, and a real admin session (not the API key) is needed to attribute the call' }, { status: 400 })
    }

    const id = randomUUID()
    await adminOrRes.sql`
      INSERT INTO dialer_call_log (id, business_key, placed_by, to_number, contact_name)
      VALUES (${id}, ${businessKey}, ${adminOrRes.user.id}, ${toNumber}, ${contactName})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function PATCH(req: Request) {
  const adminOrRes = await requireAdmin(req)
  if (adminOrRes instanceof NextResponse) return adminOrRes
  try {
    const body = await req.json().catch(() => ({}))
    const id = typeof body?.id === 'string' ? body.id : null
    const status = typeof body?.status === 'string' ? body.status : 'completed'
    const durationSeconds = Number.isFinite(body?.durationSeconds) ? Math.max(0, Math.round(body.durationSeconds)) : 0
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await adminOrRes.sql`
      UPDATE dialer_call_log SET status = ${status}, duration_seconds = ${durationSeconds}, ended_at = now() WHERE id = ${id}
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
