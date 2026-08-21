import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { isSpecialist } from '@/lib/agentTasks'
import { errorResponse } from '@/lib/errors'

// Adding a task here (rather than just telling an agent in chat) is what
// lets everyone see the full task list per agent and avoid assigning the
// same thing twice. An optional targetAgent (a lib/agentAgency/ specialist)
// makes the task actually runnable through the agency — see this route's
// sibling [taskId]/run for what executes it — a task without one just stays
// a plain manual to-do like before Phase 3.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const description = typeof body?.description === 'string' ? body.description.trim() : null
    const targetAgent = isSpecialist(body?.targetAgent) ? body.targetAgent : null
    if (!title) return NextResponse.json({ error: 'Task title is required' }, { status: 400 })

    const agentRows = (await sql`SELECT id FROM agents WHERE id = ${params.id}`) as unknown as { id: string }[]
    if (!agentRows[0]) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const id = randomUUID()
    await sql`
      INSERT INTO agent_tasks (id, agent_id, title, description, objective, target_agent, source_agent)
      VALUES (${id}, ${params.id}, ${title}, ${description}, ${description || title}, ${targetAgent}, 'admin')
    `
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return errorResponse(err)
  }
}
