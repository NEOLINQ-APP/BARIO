import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Lets the admin edit an existing agent's registry entry — e.g. marking
// one as retired/merged when its job gets absorbed by another agent, or
// pausing one temporarily, without needing a code deploy.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const fields: Record<string, string> = {}
    for (const key of ['role', 'description', 'responsibilities', 'channels', 'status'] as const) {
      if (typeof body?.[key] === 'string') fields[key] = body[key].trim()
    }
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    if ('role' in fields) await sql`UPDATE agents SET role = ${fields.role} WHERE id = ${params.id}`
    if ('description' in fields) await sql`UPDATE agents SET description = ${fields.description} WHERE id = ${params.id}`
    if ('responsibilities' in fields) await sql`UPDATE agents SET responsibilities = ${fields.responsibilities} WHERE id = ${params.id}`
    if ('channels' in fields) await sql`UPDATE agents SET channels = ${fields.channels} WHERE id = ${params.id}`
    if ('status' in fields) await sql`UPDATE agents SET status = ${fields.status} WHERE id = ${params.id}`

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
