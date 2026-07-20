import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

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
    await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${reset.user_id}`
    await sql`UPDATE password_reset_tokens SET used = true WHERE id = ${reset.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
