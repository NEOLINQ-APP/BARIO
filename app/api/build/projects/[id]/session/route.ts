import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuildAccess } from '@/lib/access'
import { ensureSandboxSession } from '@/lib/buildSession'
import { errorResponse } from '@/lib/errors'

// Ensures (creating if needed) an active sandbox session for a project and
// returns its preview URL — used by the editor UI to load the preview pane
// on page load, before any chat message has been sent.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuildAccess(user)) return NextResponse.json({ error: 'Please verify your email' }, { status: 403 })

    const projectRows = (await sql`SELECT id FROM build_projects WHERE id = ${params.id} AND user_id = ${user.id}`) as unknown as { id: string }[]
    if (projectRows.length === 0) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { previewUrl } = await ensureSandboxSession(sql, params.id, user.id)
    return NextResponse.json({ previewUrl })
  } catch (err: any) {
    return errorResponse(err)
  }
}
