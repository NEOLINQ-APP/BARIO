import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyFamilyToken } from '@/lib/victoriaFamilyAccess'
import { errorResponse } from '@/lib/errors'

// Opt-in only: she has to explicitly turn this on herself in her own app
// (real browser geolocation permission prompt either way — there is no way
// to read location without her seeing that), and turning it off clears
// whatever was stored. Never set or read from anywhere except her own
// token-gated request.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const memberKey = typeof body?.member === 'string' ? body.member : null
    const token = typeof body?.token === 'string' ? body.token : null

    const sql = await db()
    const member = await verifyFamilyToken(sql, memberKey, token)
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (typeof body?.enabled === 'boolean') {
      if (body.enabled) {
        await sql`UPDATE victoria_family_members SET location_sharing_enabled = true WHERE key = ${member.key}`
      } else {
        await sql`
          UPDATE victoria_family_members
          SET location_sharing_enabled = false, last_location_lat = NULL, last_location_lng = NULL, last_location_at = NULL
          WHERE key = ${member.key}
        `
      }
      return NextResponse.json({ ok: true, enabled: body.enabled })
    }

    if (typeof body?.lat === 'number' && typeof body?.lng === 'number') {
      if (!member.location_sharing_enabled) return NextResponse.json({ error: 'Location sharing is not enabled' }, { status: 403 })
      await sql`
        UPDATE victoria_family_members
        SET last_location_lat = ${body.lat}, last_location_lng = ${body.lng}, last_location_at = now()
        WHERE key = ${member.key}
      `
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  } catch (err) {
    return errorResponse(err)
  }
}
