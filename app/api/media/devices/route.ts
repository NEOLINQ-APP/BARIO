import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type PersonalAccessToken } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Browser-session-only (not Bearer) — this is the "manage my devices" page a
// user reaches by logging into bario.ca normally, not something the desktop
// client itself calls.
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`
      SELECT id, device_name, created_at, last_used_at, revoked_at
      FROM personal_access_tokens
      WHERE user_id = ${session.userId}
      ORDER BY created_at DESC
    `) as unknown as Omit<PersonalAccessToken, 'user_id' | 'token_hash'>[]

    return NextResponse.json({ ok: true, devices: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
