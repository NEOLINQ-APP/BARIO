import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuildAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'

// Persisted chat/command history for a project — lets reopening a project
// (new tab, next day) pick up where it left off instead of starting blank,
// and gives a real record of what was actually run against the sandbox.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuildAccess(user)) return NextResponse.json({ error: 'Please verify your email' }, { status: 403 })

    const projectRows = (await sql`SELECT id FROM build_projects WHERE id = ${params.id} AND user_id = ${user.id}`) as unknown as { id: string }[]
    if (projectRows.length === 0) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const rows = (await sql`
      SELECT role, content, tool_calls_json, created_at FROM build_chat_messages
      WHERE project_id = ${params.id} ORDER BY created_at ASC
    `) as unknown as { role: string; content: string; tool_calls_json: string; created_at: string }[]

    return NextResponse.json({
      messages: rows.map((r) => ({
        role: r.role,
        content: r.content,
        toolCalls: JSON.parse(r.tool_calls_json || '[]'),
      })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
