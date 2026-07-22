import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const { token } = await req.json()
    if (typeof token !== 'string' || !token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const sql = await db()
    const rows = (await sql`
      SELECT id, user_id FROM email_verification_tokens WHERE token = ${token} AND used = false AND expires_at > now()
    `) as unknown as { id: string; user_id: string }[]
    const record = rows[0]
    if (!record) {
      return NextResponse.json({ error: 'This verification link is invalid or has expired' }, { status: 400 })
    }

    await sql`UPDATE users SET email_verified = true WHERE id = ${record.user_id}`
    await sql`UPDATE email_verification_tokens SET used = true WHERE id = ${record.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
