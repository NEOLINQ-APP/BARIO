import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuildAccess } from '@/lib/access'
import { destroySandboxSession } from '@/lib/sandboxHost'
import { errorResponse } from '@/lib/errors'
import { logAdminAction } from '@/lib/adminActions'

// Deletes a project. Same dual-auth shape as the admin routes (lib/admin.ts):
// a logged-in owner can delete their own project, OR a
// Authorization: Bearer BARIO_ADMIN_API_KEY call can delete any project on a
// customer's behalf without needing their session — there's no admin UI for
// Bario Build yet, so this is the only way to do that server-side.
// build_files/build_chat_messages/build_sandbox_sessions/build_published_apps
// all reference build_projects with ON DELETE CASCADE, so the DB side is a
// single statement — but that cascade only removes rows, not the real
// Docker container a 'running' session points to on the sandbox host, so
// that's torn down first (best-effort: a stale/already-gone container
// shouldn't block deleting the project itself).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const sql = await db()
    const apiKey = process.env.BARIO_ADMIN_API_KEY
    const authHeader = req.headers.get('authorization')
    const isAdminCall = !!apiKey && authHeader === `Bearer ${apiKey}`

    let projectRows: { id: string; user_id: string }[]
    if (isAdminCall) {
      projectRows = (await sql`SELECT id, user_id FROM build_projects WHERE id = ${params.id}`) as unknown as { id: string; user_id: string }[]
    } else {
      const session = await getSession()
      if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
      const user = userRows[0]
      if (!user || !hasBuildAccess(user)) return NextResponse.json({ error: 'Please verify your email' }, { status: 403 })
      projectRows = (await sql`SELECT id, user_id FROM build_projects WHERE id = ${params.id} AND user_id = ${user.id}`) as unknown as { id: string; user_id: string }[]
    }
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

    await sql`DELETE FROM build_projects WHERE id = ${params.id}`
    if (isAdminCall) {
      await logAdminAction(sql, { action: 'build_project_delete', params: { projectId: params.id }, result: 'ok' })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
