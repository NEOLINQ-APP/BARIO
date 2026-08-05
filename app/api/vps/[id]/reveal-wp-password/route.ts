import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type VpsInstance } from '@/lib/db'
import { decryptPassword } from '@/lib/vpsPassword'
import { errorResponse } from '@/lib/errors'

// One-time reveal for the WordPress admin password (separate from the box's
// own root password — see reveal-password/route.ts) — same nulls-after-read
// pattern.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`
      SELECT * FROM vps_instances WHERE id = ${params.id} AND user_id = ${session.userId}
    `) as unknown as VpsInstance[]
    const order = rows[0]
    if (!order) return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    if (!order.wp_admin_password_ciphertext || !order.wp_admin_password_iv) {
      return NextResponse.json({ error: 'No WordPress password available — it may have already been revealed.' }, { status: 400 })
    }

    const password = decryptPassword(order.wp_admin_password_ciphertext, order.wp_admin_password_iv)
    await sql`
      UPDATE vps_instances SET wp_admin_password_ciphertext = NULL, wp_admin_password_iv = NULL, wp_admin_password_revealed_at = now(), updated_at = now()
      WHERE id = ${params.id}
    `

    return NextResponse.json({ ok: true, username: order.wp_admin_user, password })
  } catch (err: any) {
    return errorResponse(err)
  }
}
