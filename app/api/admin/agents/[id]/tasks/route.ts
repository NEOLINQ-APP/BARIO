import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Adding a task here (rather than just telling an agent in chat) is what
// lets everyone see the full task list per agent and avoid assigning the
// same thing twice.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const description = typeof body?.description === 'string' ? body.description.trim() : null
    if (!title) return NextResponse.json({ error: 'Task title is required' }, { status: 400 })

    const agentRows = (await sql`SELECT id FROM agents WHERE id = ${params.id}`) as unknown as { id: string }[]
    if (!agentRows[0]) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const id = randomUUID()
    await sql`INSERT INTO agent_tasks (id, agent_id, title, description) VALUES (${id}, ${params.id}, ${title}, ${description})`
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return errorResponse(err)
  }
}
