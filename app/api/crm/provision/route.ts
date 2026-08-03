import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasPaidPlan } from '@/lib/access'
import { slugify, pointStackDns, startStackProvision, checkStackStatus } from '@/lib/crmStack'
import { errorResponse } from '@/lib/errors'

async function uniqueSlug(sql: any, displayName: string): Promise<string> {
  const base = slugify(displayName)
  let candidate = base
  let n = 2
  // Loop bound is generous but finite — collisions past a handful of
  // suffixes would indicate something wrong with the input, not a real
  // naming exhaustion scenario worth handling specially.
  while (n < 100) {
    const existing = (await sql`SELECT id FROM crm_stacks WHERE slug = ${candidate}`) as unknown as { id: string }[]
    if (!existing[0]) return candidate
    candidate = `${base}-${n}`
    n++
  }
  return `${base}-${randomUUID().slice(0, 6)}`
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasPaidPlan(user)) {
      return NextResponse.json({ error: 'Upgrade to a paid plan to set up your CRM' }, { status: 403 })
    }

    const existing = (await sql`SELECT id FROM crm_stacks WHERE user_id = ${session.userId}`) as unknown as { id: string }[]
    if (existing[0]) {
      return NextResponse.json({ error: 'You already have a CRM workspace' }, { status: 409 })
    }

    const body = await req.json().catch(() => ({}))
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!displayName) return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

    const id = randomUUID()
    const slug = await uniqueSlug(sql, displayName)
    const subdomain = `${slug}.crm.bario.ca`

    try {
      await pointStackDns(slug)
      await startStackProvision({ slug, displayName, adminEmail: email, adminPassword: password })
      await sql`
        INSERT INTO crm_stacks (id, user_id, slug, subdomain, workspace_display_name, login_email, status)
        VALUES (${id}, ${session.userId}, ${slug}, ${subdomain}, ${displayName}, ${email}, 'provisioning')
      `
    } catch (err: any) {
      await sql`
        INSERT INTO crm_stacks (id, user_id, slug, subdomain, workspace_display_name, login_email, status, last_error)
        VALUES (${id}, ${session.userId}, ${slug}, ${subdomain}, ${displayName}, ${email}, 'failed', ${err.message ?? 'Unknown error'})
      `
      throw err
    }

    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`
      SELECT id, slug, subdomain, workspace_display_name, login_email, status, step, last_error, created_at
      FROM crm_stacks WHERE user_id = ${session.userId}
    `) as unknown as { id: string; slug: string; subdomain: string; workspace_display_name: string; login_email: string; status: string; step: string | null; last_error: string | null; created_at: string }[]

    const stack = rows[0]
    if (stack && stack.status === 'provisioning') {
      try {
        const result = await checkStackStatus(stack.slug)
        if (result.status !== stack.status || result.step !== stack.step) {
          await sql`UPDATE crm_stacks SET status = ${result.status}, step = ${result.step ?? null}, last_error = ${result.error ?? null}, updated_at = now() WHERE id = ${stack.id}`
          stack.status = result.status
          stack.step = result.step ?? null
        }
      } catch (err: any) {
        // Transient agent-reachability errors shouldn't flip a
        // still-provisioning stack to failed — only the agent's own
        // reported status does that.
      }
    }

    return NextResponse.json({
      ok: true,
      workspace: stack
        ? { id: stack.id, displayName: stack.workspace_display_name, email: stack.login_email, subdomain: stack.subdomain, status: stack.status, step: stack.step, lastError: stack.last_error }
        : null,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
