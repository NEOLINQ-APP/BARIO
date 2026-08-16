import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { pointStackDns, startStackProvision, checkStackStatus } from '@/lib/crmStack'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Bearer-gated equivalent of app/api/crm/provision (self-serve, requires a
// logged-in paid-plan user) — for standing up a real dedicated Twenty CRM
// stack for a BARIO house business (Unique Group, Bario.ca) or any other
// one-off client onboarding that shouldn't have to go through checkout.
// Same underlying crm-provision-agent as the self-serve path.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
    const adminEmail = typeof body?.adminEmail === 'string' ? body.adminEmail.trim().toLowerCase() : ''
    const adminPassword = typeof body?.adminPassword === 'string' ? body.adminPassword : ''
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''

    if (!slug || !displayName || !adminEmail || !adminPassword || !userId) {
      return NextResponse.json({ error: 'slug, displayName, adminEmail, adminPassword, and userId are all required' }, { status: 400 })
    }

    const existing = (await sql`SELECT id FROM crm_stacks WHERE slug = ${slug}`) as unknown as { id: string }[]
    if (existing[0]) return NextResponse.json({ error: 'That slug is already in use' }, { status: 409 })

    const id = randomUUID()
    const subdomain = `${slug}.crm.bario.ca`

    try {
      await pointStackDns(slug)
      await startStackProvision({ slug, displayName, adminEmail, adminPassword })
      await sql`
        INSERT INTO crm_stacks (id, user_id, slug, subdomain, workspace_display_name, login_email, status)
        VALUES (${id}, ${userId}, ${slug}, ${subdomain}, ${displayName}, ${adminEmail}, 'provisioning')
      `
    } catch (err: any) {
      await sql`
        INSERT INTO crm_stacks (id, user_id, slug, subdomain, workspace_display_name, login_email, status, last_error)
        VALUES (${id}, ${userId}, ${slug}, ${subdomain}, ${displayName}, ${adminEmail}, 'failed', ${err.message ?? 'Unknown error'})
      `
      throw err
    }

    await logAdminAction(sql, { action: 'crm-stack-provision', params: { id, slug, subdomain }, result: 'ok' })
    return NextResponse.json({ ok: true, id, subdomain })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// ?slug=<slug> — polls the agent and updates crm_stacks accordingly, same
// reconciliation logic as the self-serve GET route.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug') ?? ''
    if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })

    const rows = (await sql`SELECT * FROM crm_stacks WHERE slug = ${slug}`) as unknown as {
      id: string; slug: string; subdomain: string; status: string; step: string | null
    }[]
    const stack = rows[0]
    if (!stack) return NextResponse.json({ error: 'Unknown slug' }, { status: 404 })

    if (stack.status === 'provisioning') {
      const result = await checkStackStatus(slug)
      if (result.status !== stack.status || result.step !== stack.step) {
        await sql`UPDATE crm_stacks SET status = ${result.status}, step = ${result.step ?? null}, last_error = ${result.error ?? null}, updated_at = now() WHERE id = ${stack.id}`
        stack.status = result.status
        stack.step = result.step ?? null
      }
    }

    return NextResponse.json({ ok: true, status: stack.status, step: stack.step, subdomain: stack.subdomain })
  } catch (err: any) {
    return errorResponse(err)
  }
}
