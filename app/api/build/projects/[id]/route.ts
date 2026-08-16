import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuildAccess } from '@/lib/access'
import { destroySandboxSession } from '@/lib/sandboxHost'
import { errorResponse } from '@/lib/errors'

// Deletes a project the caller owns. build_files/build_chat_messages/
// build_sandbox_sessions/build_published_apps all reference build_projects
// with ON DELETE CASCADE, so the DB side is a single statement — but that
// cascade only removes rows, not the real Docker container a 'running'
// session points to on the sandbox host, so that's torn down first
// (best-effort: a stale/already-gone container shouldn't block deleting
// the project itself).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuildAccess(user)) return NextResponse.json({ error: 'Please verify your email' }, { status: 403 })

    const projectRows = (await sql`SELECT id FROM build_projects WHERE id = ${params.id} AND user_id = ${user.id}`) as unknown as { id: string }[]
    if (projectRows.length === 0) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const sessionRows = (await sql`
      SELECT id FROM build_sandbox_sessions WHERE project_id = ${params.id} AND status IN ('starting', 'running')
    `) as unknown as { id: string }[]
    for (const row of sessionRows) {
      try {
        await destroySandboxSession(row.id)
      } catch (err) {
        console.error(`Failed to tear down sandbox session ${row.id} while deleting project ${params.id}`, err)
      }
    }

    await sql`DELETE FROM build_projects WHERE id = ${params.id} AND user_id = ${user.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
