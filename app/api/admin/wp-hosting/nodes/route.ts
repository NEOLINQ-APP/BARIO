import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { encryptPassword } from '@/lib/vpsPassword'
import { errorResponse } from '@/lib/errors'

// Lists every shared-hosting node and registers a new one. Registering a
// node here is a separate, manual step from actually provisioning the box
// itself (that's done by hand — SSH in, install Docker/Caddy/the node
// agent, same as the validation spike) — v1 has 1-2 manually-managed
// nodes, no automatic new-node provisioning yet.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const nodes = await sql`SELECT id, ipv4, status, capacity_max_mb, capacity_used_mb, last_health_check_at, created_at FROM wp_hosting_nodes ORDER BY created_at DESC`
    return NextResponse.json({ ok: true, nodes })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const { ipv4, agentApiToken, capacityMaxMb } = await req.json()
    if (typeof ipv4 !== 'string' || !ipv4.trim()) return NextResponse.json({ error: 'ipv4 is required' }, { status: 400 })
    if (typeof agentApiToken !== 'string' || !agentApiToken.trim()) return NextResponse.json({ error: 'agentApiToken is required' }, { status: 400 })
    const maxMb = Math.round(Number(capacityMaxMb))
    if (!maxMb || maxMb <= 0) return NextResponse.json({ error: 'capacityMaxMb must be a positive number' }, { status: 400 })

    const enc = encryptPassword(agentApiToken.trim())
    const id = randomUUID()
    await sql`
      INSERT INTO wp_hosting_nodes (id, ipv4, agent_api_token_ciphertext, agent_api_token_iv, capacity_max_mb)
      VALUES (${id}, ${ipv4.trim()}, ${enc.ciphertext}, ${enc.iv}, ${maxMb})
    `
    await logAdminAction(sql, { action: 'wp-hosting-node-register', params: { id, ipv4 }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return errorResponse(err)
  }
}
