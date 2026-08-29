import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Backs Victoria's request_website_fix tool. Deliberately log-only — she
// records what was asked for so a human reviews and actually makes the
// change through Sky/the builder; she never triggers a live site edit
// herself from an unsupervised phone call.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const { requestedBy, target, description } = await req.json()
    if (typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }
    const id = randomUUID()
    await sql`
      INSERT INTO victoria_sky_requests (id, requested_by, target, description)
      VALUES (${id}, ${requestedBy || 'unknown caller'}, ${target || null}, ${description.trim()})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const rows = await sql`
      SELECT id, requested_by, target, description, status, created_at, resolved_at
      FROM victoria_sky_requests ORDER BY created_at DESC LIMIT 50
    `
    return NextResponse.json({ requests: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
