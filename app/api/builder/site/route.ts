import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const rows = (await sql`SELECT * FROM sites WHERE user_id = ${session.userId} LIMIT 1`) as unknown as {
    id: string
    name: string
    sections_json: string
  }[]
  const site = rows[0]

  return NextResponse.json({
    name: site?.name ?? 'My Site',
    sections: site ? JSON.parse(site.sections_json) : [],
  })
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { name, sections } = await req.json()
    if (!Array.isArray(sections)) {
      return NextResponse.json({ error: 'sections must be an array' }, { status: 400 })
    }

    const sql = await db()
    const existing = (await sql`SELECT id FROM sites WHERE user_id = ${session.userId} LIMIT 1`) as unknown as { id: string }[]
    const sectionsJson = JSON.stringify(sections)
    const siteName = typeof name === 'string' && name.trim() ? name.trim() : 'My Site'

    if (existing[0]) {
      await sql`
        UPDATE sites SET name = ${siteName}, sections_json = ${sectionsJson}, updated_at = now()
        WHERE id = ${existing[0].id}
      `
    } else {
      await sql`
        INSERT INTO sites (id, user_id, name, sections_json)
        VALUES (${randomUUID()}, ${session.userId}, ${siteName}, ${sectionsJson})
      `
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
