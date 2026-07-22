import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'

// Shared admin-only auth check for API routes. Returns the caller's user row
// and db handle, or an already-formed NextResponse to return immediately.
export async function requireAdmin(): Promise<{ user: User; sql: Awaited<ReturnType<typeof db>> } | NextResponse> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return { user, sql }
}
