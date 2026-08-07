import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import type { BoCustomer, BoDeal, BoTask, BoNote } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT * FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}
    `) as unknown as BoCustomer[]
    const customer = rows[0]
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const deals = (await sql`
      SELECT * FROM bo_deals WHERE customer_id = ${customer.id} AND organization_id = ${org.id} ORDER BY created_at DESC
    `) as unknown as BoDeal[]
    const tasks = (await sql`
      SELECT * FROM bo_tasks WHERE customer_id = ${customer.id} AND organization_id = ${org.id} ORDER BY due_at ASC NULLS LAST
    `) as unknown as BoTask[]
    const notes = (await sql`
      SELECT n.*, u.email as author_email FROM bo_notes n
      LEFT JOIN users u ON u.id = n.author_user_id
      WHERE n.customer_id = ${customer.id} AND n.organization_id = ${org.id}
      ORDER BY n.created_at DESC
    `) as unknown as (BoNote & { author_email: string | null })[]

    return NextResponse.json({
      customer: { ...customer, tags: JSON.parse(customer.tags_json) },
      deals,
      tasks,
      notes,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const { companyName, contactName, phone, email, address, tags } = await req.json()
    const existing = (await sql`SELECT id FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
    if (existing.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    await sql`
      UPDATE bo_customers SET
        company_name = ${companyName ?? null},
        contact_name = COALESCE(${contactName || null}, contact_name),
        phone = ${phone ?? null},
        email = ${email ?? null},
        address = ${address ?? null},
        tags_json = ${JSON.stringify(Array.isArray(tags) ? tags.filter((t: any) => typeof t === 'string') : [])},
        updated_at = now()
      WHERE id = ${params.id} AND organization_id = ${org.id}
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can delete customers' }, { status: 403 })
    }

    await sql`DELETE FROM bo_tasks WHERE customer_id = ${params.id} AND organization_id = ${org.id}`
    await sql`DELETE FROM bo_notes WHERE customer_id = ${params.id} AND organization_id = ${org.id}`
    await sql`DELETE FROM bo_deals WHERE customer_id = ${params.id} AND organization_id = ${org.id}`
    await sql`DELETE FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
