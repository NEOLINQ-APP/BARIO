import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasZeusStudioAccess } from '@/lib/access'
import { searchImage } from '@/lib/unsplash'
import { errorResponse } from '@/lib/errors'

// Real stock-photo search for the Design mode copilot's "swap imagery" tool
// — reuses the same Unsplash integration the website builder already uses, rather than
// building a second image-search path.
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user || !hasZeusStudioAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use Studio' }, { status: 403 })
    }

    const { query } = await req.json()
    if (typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'A search query is required' }, { status: 400 })
    }

    const url = await searchImage(query.trim())
    if (!url) return NextResponse.json({ error: 'No matching stock photo found' }, { status: 404 })

    return NextResponse.json({ ok: true, url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
