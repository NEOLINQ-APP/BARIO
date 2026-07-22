import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession, createSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { currentPassword, newPassword } = await req.json()
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
    }

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })

    const valid = await bcrypt.compare(currentPassword ?? '', user.password_hash)
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })

    const newHash = await bcrypt.hash(newPassword, 10)
    const newVersion = user.session_version + 1
    await sql`UPDATE users SET password_hash = ${newHash}, session_version = ${newVersion} WHERE id = ${user.id}`

    // Bumping session_version invalidates every other outstanding session
    // (e.g. a stolen cookie); re-issue a fresh one so this browser stays logged in.
    await createSession(user.id, newVersion)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
