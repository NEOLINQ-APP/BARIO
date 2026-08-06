import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decryptPassword } from '@/lib/vpsPassword'

// Polls every shared-hosting node's GET /health so the capacity picker
// (lib/wpSharedProvision.ts) only ever considers a node that's actually
// reachable right now — a downed shared node affects every site on it at
// once, unlike a single dedicated VPS failing, so this can't wait for a
// customer to notice and report it.
export const maxDuration = 30

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()
  const nodes = (await sql`
    SELECT id, ipv4, status, agent_api_token_ciphertext, agent_api_token_iv
    FROM wp_hosting_nodes WHERE status != 'draining'
  `) as unknown as { id: string; ipv4: string; status: string; agent_api_token_ciphertext: string; agent_api_token_iv: string }[]

  const results: { id: string; status: string }[] = []

  for (const node of nodes) {
    try {
      const token = decryptPassword(node.agent_api_token_ciphertext, node.agent_api_token_iv)
      const res = await fetch(`http://${node.ipv4}:4100/health`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      })
      const newStatus = res.ok ? 'active' : 'degraded'
      await sql`UPDATE wp_hosting_nodes SET status = ${newStatus}, last_health_check_at = now(), updated_at = now() WHERE id = ${node.id}`
      results.push({ id: node.id, status: newStatus })
    } catch {
      await sql`UPDATE wp_hosting_nodes SET status = 'unreachable', last_health_check_at = now(), updated_at = now() WHERE id = ${node.id}`
      results.push({ id: node.id, status: 'unreachable' })
    }
  }

  return NextResponse.json({ ok: true, results })
}
