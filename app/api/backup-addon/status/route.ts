import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const sql = await db()
    const rows = (await sql`SELECT backup_addon_status FROM users WHERE id = ${session.userId}`) as unknown as Pick<User, 'backup_addon_status'>[]
    return NextResponse.json({ status: rows[0]?.backup_addon_status ?? null })
  } catch (err) {
    return errorResponse(err)
  }
}
