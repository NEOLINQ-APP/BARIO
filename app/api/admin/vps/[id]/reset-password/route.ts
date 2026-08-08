import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { resetRootPassword } from '@/lib/hetzner'
import { logAdminAction } from '@/lib/adminActions'
import type { VpsInstance } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Recovery path for a lost root password (SSH key auth is otherwise the
// only way in) — asks Hetzner itself to generate and set a fresh one
// server-side, no existing access required. Returns it once; nothing is
// stored, matching reveal-password's one-time semantics.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(_req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM vps_instances WHERE id = ${params.id}`) as unknown as VpsInstance[]
    const order = rows[0]
    if (!order?.hetzner_server_id) return NextResponse.json({ error: 'Server not found' }, { status: 404 })

    const password = await resetRootPassword(order.hetzner_server_id)
    await logAdminAction(sql, { action: 'vps-reset-password', params: { id: params.id }, result: 'ok' })

    return NextResponse.json({ ok: true, password })
  } catch (err: any) {
    return errorResponse(err)
  }
}
