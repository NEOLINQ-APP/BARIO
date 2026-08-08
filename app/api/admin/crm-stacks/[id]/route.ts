import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'
import type { CrmStack } from '@/lib/db'

// Removes the DB record only — the actual Docker stack (containers,
// nginx vhost, TLS cert, DNS record) on the VPS is NOT torn down by this
// route, since crm-provision-agent doesn't expose a deprovision endpoint
// yet. Do that manually on the VPS first (docker compose down -v in the
// stack's directory, remove the nginx config + certbot cert, delete the
// Cloudflare DNS record), then call this to remove the row.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM crm_stacks WHERE id = ${params.id}`) as unknown as CrmStack[]
    const stack = rows[0]
    if (!stack) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await sql`DELETE FROM crm_stacks WHERE id = ${params.id}`
    await logAdminAction(sql, { action: 'crm-stack-deleted', params: { id: params.id, slug: stack.slug }, result: 'ok' })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
