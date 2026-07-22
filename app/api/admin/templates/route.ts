import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import type { Template } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  const templates = (await sql`
    SELECT id, title, category, description, created_at FROM templates ORDER BY created_at DESC
  `) as unknown as Template[]
  return NextResponse.json({ templates })
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { title, category, description, html } = await req.json()
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (typeof html !== 'string' || !html.trim()) {
      return NextResponse.json({ error: 'HTML content is required' }, { status: 400 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO templates (id, title, category, description, html, is_premium, price_cents)
      VALUES (${id}, ${title.trim()}, ${typeof category === 'string' && category.trim() ? category.trim() : 'General'}, ${typeof description === 'string' ? description.trim() : ''}, ${html}, false, 0)
    `

    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
