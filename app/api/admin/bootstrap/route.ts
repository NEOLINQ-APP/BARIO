import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Temporary, secret-gated one-off admin route. Deleted immediately after use —
// see prior uses of this same pattern in git history for one-off account fixes.
export async function POST(req: Request) {
  const secret = req.headers.get('x-bootstrap-secret')
  if (!secret || secret !== process.env.ADMIN_BOOTSTRAP_SECRET) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { email } = await req.json()
  if (typeof email !== 'string' || !email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const sql = await db()
  const result = await sql`
    UPDATE users SET subscription_status = 'active', email_verified = true, plan = 'migrated'
    WHERE email = ${email}
    RETURNING id, email, subscription_status, email_verified, plan
  `
  return NextResponse.json({ ok: true, result })
}
