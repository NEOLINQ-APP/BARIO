import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Revoke a synced device — sets revoked_at rather than deleting the row, so
// the device stays visible in its "revoked" state instead of just vanishing.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = await sql`
      UPDATE personal_access_tokens
      SET revoked_at = now()
      WHERE id = ${params.id} AND user_id = ${session.userId} AND revoked_at IS NULL
      RETURNING id
    ` as unknown as { id: string }[]
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
