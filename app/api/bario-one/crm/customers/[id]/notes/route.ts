import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const customerRows = (await sql`SELECT id FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
    if (customerRows.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const { body } = await req.json()
    if (typeof body !== 'string' || !body.trim()) {
      return NextResponse.json({ error: 'Note body is required' }, { status: 400 })
    }

    await sql`
      INSERT INTO bo_notes (id, organization_id, customer_id, author_user_id, kind, body)
      VALUES (${randomUUID()}, ${org.id}, ${params.id}, ${user.id}, 'note', ${body.trim()})
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
