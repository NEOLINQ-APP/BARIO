import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createOrganizationWithOwner } from '@/lib/barioOne'
import { BO_MODULE_KEYS, type BoModuleKey } from '@/lib/barioOneModules'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Admin equivalent of POST /api/bario-one/signup's org-creation half — for
// an EXISTING Bario account (no new user/password/session involved), e.g.
// onboarding an existing client company onto Bario One without them going
// through public self-serve signup themselves. Same 14-day trial, same
// module-dependency resolution, via the same createOrganizationWithOwner()
// the public route uses — no separate code path to drift out of sync.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email, companyName, moduleKeys } = await req.json()

    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }
    if (typeof companyName !== 'string' || !companyName.trim()) {
      return NextResponse.json({ error: 'companyName is required' }, { status: 400 })
    }
    if (!Array.isArray(moduleKeys) || moduleKeys.length === 0 || !moduleKeys.every((k) => (BO_MODULE_KEYS as string[]).includes(k))) {
      return NextResponse.json({ error: `moduleKeys must be a non-empty array of: ${BO_MODULE_KEYS.join(', ')}` }, { status: 400 })
    }

    const userRows = (await sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string }[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: `No Bario account found for ${email} — they need to sign up first` }, { status: 404 })

    const org = await createOrganizationWithOwner(sql, user.id, companyName.trim(), moduleKeys as BoModuleKey[])

    await logAdminAction(sql, {
      action: 'bario_one_admin_create_org',
      targetEmail: email,
      params: { orgId: org.id, companyName, moduleKeys },
      result: 'ok',
    })

    return NextResponse.json({ ok: true, orgId: org.id, orgSlug: org.slug, trialEndsAt: org.trial_ends_at, enabledModules: JSON.parse(org.enabled_modules_json) })
  } catch (err) {
    return errorResponse(err)
  }
}
