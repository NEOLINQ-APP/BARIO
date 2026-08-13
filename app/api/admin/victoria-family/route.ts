import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import type { VictoriaFamilyMember } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Admin-only management for Victoria's family-member chat/call links
// (Mya, Julianna, ...) — create/rotate a member's access token, and check
// whatever location they've chosen to share (see
// app/api/victoria/family/location/route.ts — off by default, they turn it
// on themselves, never set from this side).
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  const members = (await sql`SELECT * FROM victoria_family_members ORDER BY name`) as unknown as VictoriaFamilyMember[]
  return NextResponse.json({
    members: members.map((m) => ({
      key: m.key,
      name: m.name,
      phoneNumber: m.phone_number,
      link: `https://www.bario.ca/victoria-family/${m.key}?token=${m.access_token}`,
      locationSharingEnabled: m.location_sharing_enabled,
      lastLocation: m.location_sharing_enabled && m.last_location_lat != null
        ? { lat: m.last_location_lat, lng: m.last_location_lng, at: m.last_location_at, mapsUrl: `https://maps.google.com/?q=${m.last_location_lat},${m.last_location_lng}` }
        : null,
    })),
  })
}

// Creates a member if `key` doesn't exist yet, or rotates their token if it
// does (pass rotate: true) — never silently regenerates an existing link,
// since that would break it without warning.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const key = typeof body?.key === 'string' ? body.key.trim().toLowerCase() : ''
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const phoneNumber = typeof body?.phoneNumber === 'string' ? body.phoneNumber.trim() : null
    const rotate = body?.rotate === true
    if (!/^[a-z]+$/.test(key) || !name) {
      return NextResponse.json({ error: 'key (lowercase letters only) and name are required' }, { status: 400 })
    }

    const existing = (await sql`SELECT * FROM victoria_family_members WHERE key = ${key}`) as unknown as VictoriaFamilyMember[]
    if (existing[0] && !rotate) {
      return NextResponse.json({ error: 'Already exists — pass rotate: true to generate a new token' }, { status: 409 })
    }

    const token = randomBytes(16).toString('hex')
    if (existing[0]) {
      await sql`UPDATE victoria_family_members SET access_token = ${token}, name = ${name}, phone_number = ${phoneNumber} WHERE key = ${key}`
    } else {
      await sql`
        INSERT INTO victoria_family_members (key, name, phone_number, access_token)
        VALUES (${key}, ${name}, ${phoneNumber}, ${token})
      `
    }

    return NextResponse.json({ ok: true, key, link: `https://www.bario.ca/victoria-family/${key}?token=${token}` })
  } catch (err) {
    return errorResponse(err)
  }
}
