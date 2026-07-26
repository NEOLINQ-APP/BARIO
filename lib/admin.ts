import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'

// Shared admin-only auth check for API routes. Accepts either a logged-in
// admin session (browser) or a Bearer BARIO_ADMIN_API_KEY (server-to-server
// / scripted access — e.g. adding templates or storage files without going
// through the admin UI by hand). Returns the caller's user row (null for
// API-key calls, which aren't tied to a specific account) and db handle, or
// an already-formed NextResponse to return immediately.
export async function requireAdmin(req?: Request): Promise<{ user: User | null; sql: Awaited<ReturnType<typeof db>> } | NextResponse> {
  const apiKey = process.env.BARIO_ADMIN_API_KEY
  const authHeader = req?.headers.get('authorization')
  if (apiKey && authHeader === `Bearer ${apiKey}`) {
    return { user: null, sql: await db() }
  }

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return { user, sql }
}
