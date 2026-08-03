import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import type { Agent, AgentTask } from '@/lib/db'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const agents = (await sql`SELECT * FROM agents ORDER BY created_at`) as unknown as Agent[]
    const tasks = (await sql`SELECT * FROM agent_tasks ORDER BY created_at DESC`) as unknown as AgentTask[]
    return NextResponse.json({
      ok: true,
      agents: agents.map((a) => ({ ...a, tasks: tasks.filter((t) => t.agent_id === a.id) })),
    })
  } catch (err) {
    return errorResponse(err)
  }
}

// Lets the admin register a new agent (e.g. a future one beyond
// Victoria/Miko/Amber) directly from the roster page, without needing a
// code deploy just to describe what it does.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const role = typeof body?.role === 'string' ? body.role.trim() : ''
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const responsibilities = typeof body?.responsibilities === 'string' ? body.responsibilities.trim() : ''
    const channels = typeof body?.channels === 'string' ? body.channels.trim() : ''
    if (!name || !role) return NextResponse.json({ error: 'Name and role are required' }, { status: 400 })

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const id = randomUUID()
    await sql`
      INSERT INTO agents (id, slug, name, role, description, responsibilities, channels)
      VALUES (${id}, ${slug}, ${name}, ${role}, ${description}, ${responsibilities}, ${channels})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return errorResponse(err)
  }
}
