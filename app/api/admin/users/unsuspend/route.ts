import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { userId } = await req.json()
    if (typeof userId !== 'string' || !userId.trim()) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const rows = (await sql`
      UPDATE users SET suspended_at = NULL WHERE id = ${userId} RETURNING id, email
    `) as unknown as { id: string; email: string }[]
    if (!rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    await logAdminAction(sql, { action: 'user-unsuspended', targetEmail: rows[0].email, params: { userId }, result: 'ok' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
