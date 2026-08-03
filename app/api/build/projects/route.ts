import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuildAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuildAccess(user)) return NextResponse.json({ error: 'Please verify your email' }, { status: 403 })

    const projects = await sql`SELECT * FROM build_projects WHERE user_id = ${user.id} ORDER BY updated_at DESC`
    return NextResponse.json({ projects })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuildAccess(user)) return NextResponse.json({ error: 'Please verify your email' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : 'Untitled project'

    const id = randomUUID()
    await sql`INSERT INTO build_projects (id, user_id, name) VALUES (${id}, ${user.id}, ${name})`
    return NextResponse.json({ id, name })
  } catch (err: any) {
    return errorResponse(err)
  }
}
