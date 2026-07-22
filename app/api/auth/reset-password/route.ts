import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json()
    if (typeof token !== 'string' || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'A valid token and an 8+ character password are required' }, { status: 400 })
    }

    const sql = await db()
    const rows = (await sql`
      SELECT * FROM password_reset_tokens WHERE token = ${token} AND used = false AND expires_at > now()
    `) as unknown as { id: string; user_id: string }[]
    const reset = rows[0]
    if (!reset) {
      return NextResponse.json({ error: 'This reset link is invalid or has expired' }, { status: 400 })
    }

    const newHash = await bcrypt.hash(password, 10)
    // Bumps session_version too, so any session issued before this reset
    // (e.g. one an attacker who triggered the reset already had) stops working.
    await sql`UPDATE users SET password_hash = ${newHash}, session_version = session_version + 1 WHERE id = ${reset.user_id}`
    await sql`UPDATE password_reset_tokens SET used = true WHERE id = ${reset.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
