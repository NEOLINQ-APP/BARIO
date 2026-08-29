import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createBoApiKey } from '@/lib/barioOneApiKeys'
import { logAdminAction } from '@/lib/adminActions'
import type { BoOrganization } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Admin equivalent of POST /api/bario-one/keys, which is deliberately
// owner-session-only (issuing a credential that can act on the org's data is
// a financial/security decision — see that route's own comment). This exists
// for onboarding an org onto the v1 API without the owner going through the
// dashboard themselves, e.g. a first-party integration (another Bario
// product's own site pushing leads in) being wired up on the org's behalf.
// Same Bearer-admin-key gate as every other /api/admin/* route.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin(req)
    if (auth instanceof NextResponse) return auth
    const { sql } = auth

    const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${params.id}`) as unknown as BoOrganization[]
    const org = orgRows[0]
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const { name } = await req.json().catch(() => ({}))
    const cleanName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : 'API key'

    const { id, rawKey } = await createBoApiKey(sql, org.id, org.owner_user_id, cleanName)

    await logAdminAction(sql, {
      action: 'bario_one_admin_create_api_key',
      targetEmail: org.name,
      params: { organizationId: org.id, keyId: id, name: cleanName },
      result: 'ok',
    })

    return NextResponse.json({ ok: true, id, rawKey })
  } catch (err: any) {
    return errorResponse(err)
  }
}
