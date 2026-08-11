import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import type { BoTask } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const status = new URL(req.url).searchParams.get('status')
    const rows = (
      status === 'open' || status === 'done'
        ? await sql`
            SELECT t.*, c.contact_name FROM bo_tasks t
            LEFT JOIN bo_customers c ON c.id = t.customer_id
            WHERE t.organization_id = ${org.id} AND t.status = ${status}
            ORDER BY t.due_at ASC NULLS LAST
          `
        : await sql`
            SELECT t.*, c.contact_name FROM bo_tasks t
            LEFT JOIN bo_customers c ON c.id = t.customer_id
            WHERE t.organization_id = ${org.id}
            ORDER BY t.due_at ASC NULLS LAST
          `
    ) as unknown as (BoTask & { contact_name: string | null })[]

    return NextResponse.json({ tasks: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const { customerId, dealId, title, dueAt } = await req.json()
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    if (customerId) {
      const rows = (await sql`SELECT id FROM bo_customers WHERE id = ${customerId} AND organization_id = ${org.id}`) as unknown[]
      if (rows.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO bo_tasks (id, organization_id, customer_id, deal_id, assigned_to_user_id, title, due_at, created_by_user_id)
      VALUES (${id}, ${org.id}, ${customerId || null}, ${dealId || null}, ${user.id}, ${title.trim()}, ${dueAt || null}, ${user.id})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
