import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { BO_MODULE_KEYS, type BoModuleKey } from '@/lib/barioOneModules'
import type { BoOrganization } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Admin-only override for an organization's enabled modules — same
// Bearer-or-session shape as every other admin route, for support fixes
// (comping a module, correcting a bad backfill) without needing direct DB
// access.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin(req)
    if (auth instanceof NextResponse) return auth
    const { sql } = auth

    const existing = (await sql`SELECT * FROM bo_organizations WHERE id = ${params.id}`) as unknown as BoOrganization[]
    if (!existing[0]) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const { moduleKeys } = await req.json()
    if (!Array.isArray(moduleKeys) || !moduleKeys.every((k) => (BO_MODULE_KEYS as string[]).includes(k))) {
      return NextResponse.json({ error: `moduleKeys must be an array of: ${BO_MODULE_KEYS.join(', ')}` }, { status: 400 })
    }

    const json = JSON.stringify(moduleKeys as BoModuleKey[])
    await sql`UPDATE bo_organizations SET enabled_modules_json = ${json}, updated_at = now() WHERE id = ${params.id}`

    await logAdminAction(sql, {
      action: 'bario_one_set_modules',
      targetEmail: existing[0].name,
      params: { organizationId: params.id, moduleKeys },
      result: 'ok',
    })

    return NextResponse.json({ ok: true, enabledModules: moduleKeys })
  } catch (err: any) {
    return errorResponse(err)
  }
}
