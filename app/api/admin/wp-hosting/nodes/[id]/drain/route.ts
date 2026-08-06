import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Marks a node 'draining' so the capacity picker (lib/wpSharedProvision.ts)
// stops assigning new sites to it, without touching sites already running
// there — a deliberate step before decommissioning a node, not an
// emergency stop (there's no forced site migration here).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const rows = await sql`UPDATE wp_hosting_nodes SET status = 'draining', updated_at = now() WHERE id = ${params.id} RETURNING id`
    if (!rows[0]) return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    await logAdminAction(sql, { action: 'wp-hosting-node-drain', params: { id: params.id }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
