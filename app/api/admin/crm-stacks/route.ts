import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'
import type { CrmStack } from '@/lib/db'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`
      SELECT cs.*, u.email AS user_email FROM crm_stacks cs
      JOIN users u ON u.id = cs.user_id
      ORDER BY cs.workspace_display_name
    `) as unknown as (CrmStack & { user_email: string })[]
    const stacks = rows.map((s) => ({
      id: s.id,
      slug: s.slug,
      subdomain: s.subdomain,
      workspaceDisplayName: s.workspace_display_name,
      loginEmail: s.login_email,
      status: s.status,
      userEmail: s.user_email,
      hasPassword: !!(s.login_password_encrypted && s.login_password_iv),
    }))
    return NextResponse.json({ ok: true, stacks })
  } catch (err) {
    return errorResponse(err)
  }
}

// Manual registration for client CRMs that didn't come through the
// self-serve reseller pipeline (app/api/crm/provision) — namely AFC
// Logistics and Sunbuilt Group, hand-built on the VPS before that pipeline
// existed. Also usable for any future one-off client onboarding.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    const subdomain = typeof body?.subdomain === 'string' ? body.subdomain.trim() : ''
    const workspaceDisplayName = typeof body?.workspaceDisplayName === 'string' ? body.workspaceDisplayName.trim() : ''
    const loginEmail = typeof body?.loginEmail === 'string' ? body.loginEmail.trim().toLowerCase() : ''
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''

    if (!slug || !subdomain || !workspaceDisplayName || !loginEmail || !userId) {
      return NextResponse.json({ error: 'slug, subdomain, workspaceDisplayName, loginEmail, and userId are all required' }, { status: 400 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO crm_stacks (id, user_id, slug, subdomain, workspace_display_name, login_email, status)
      VALUES (${id}, ${userId}, ${slug}, ${subdomain}, ${workspaceDisplayName}, ${loginEmail}, 'active')
    `

    await logAdminAction(sql, { action: 'crm-stack-registered', params: { id, slug }, result: 'ok' })
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return errorResponse(err)
  }
}
