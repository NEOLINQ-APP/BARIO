import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import type { CrmStack } from '@/lib/db'
import { encryptSecret } from '@/lib/flo/crypto'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Interim link step until crm-provision-agent (the separate VPS-side
// service that actually creates each Twenty workspace) generates and hands
// back an API key at provision time — that's a change to a different, live
// service and out of scope here. Until then: log into the workspace once
// with the admin credentials crm_stacks.login_email was created with,
// generate a Twenty API key from its own Settings > APIs screen, and POST
// it here. Bearer-gated like every other admin route (lib/admin.ts) so this
// is scriptable without a browser session.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { apiKey } = await req.json()
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      return NextResponse.json({ error: 'apiKey is required' }, { status: 400 })
    }

    const rows = (await sql`SELECT * FROM crm_stacks WHERE id = ${params.id}`) as unknown as CrmStack[]
    const stack = rows[0]
    if (!stack) return NextResponse.json({ error: 'CRM workspace not found' }, { status: 404 })

    const { ciphertext, iv } = encryptSecret(apiKey.trim())
    await sql`
      UPDATE crm_stacks SET twenty_api_key_encrypted = ${ciphertext}, twenty_api_key_iv = ${iv}, updated_at = now()
      WHERE id = ${stack.id}
    `

    await logAdminAction(sql, { action: 'crm-stack-link-api-key', params: { crmStackId: stack.id, slug: stack.slug }, result: 'ok' })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
