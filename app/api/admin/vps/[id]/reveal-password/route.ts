import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { decryptPassword } from '@/lib/vpsPassword'
import { logAdminAction } from '@/lib/adminActions'
import type { VpsInstance } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Admin-Bearer equivalent of /api/vps/[id]/reveal-password — needed for
// admin-comped servers (internal ops boxes, support cases) where there's
// no customer browser session to drive the session-gated route. Same
// one-time-reveal-then-null semantics, not a bypass of them.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM vps_instances WHERE id = ${params.id}`) as unknown as VpsInstance[]
    const order = rows[0]
    if (!order) return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    if (!order.root_password_ciphertext || !order.root_password_iv) {
      return NextResponse.json({ error: 'No password available — either an SSH key was used, or it was already revealed.' }, { status: 400 })
    }

    const password = decryptPassword(order.root_password_ciphertext, order.root_password_iv)
    await sql`
      UPDATE vps_instances SET root_password_ciphertext = NULL, root_password_iv = NULL, root_password_revealed_at = now(), updated_at = now()
      WHERE id = ${params.id}
    `
    await logAdminAction(sql, { action: 'vps-reveal-password', params: { id: params.id }, result: 'ok' })

    return NextResponse.json({ ok: true, password })
  } catch (err: any) {
    return errorResponse(err)
  }
}
