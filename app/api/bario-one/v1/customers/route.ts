import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoApiKey } from '@/lib/barioOneApiAuth'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import type { BoCustomer } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireBoApiKey(req)
  if (auth instanceof NextResponse) return auth
  const { sql, org } = auth

  try {
    const rows = (await sql`SELECT * FROM bo_customers WHERE organization_id = ${org.id} ORDER BY created_at DESC LIMIT 200`) as unknown as BoCustomer[]
    return NextResponse.json({
      customers: rows.map((c) => ({
        id: c.id,
        companyName: c.company_name,
        contactName: c.contact_name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        tags: JSON.parse(c.tags_json),
        loyaltyPoints: c.loyalty_points,
        createdAt: c.created_at,
      })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireBoApiKey(req)
  if (auth instanceof NextResponse) return auth
  const { sql, org } = auth

  try {
    const body = await req.json()
    const contactName = typeof body?.contactName === 'string' ? body.contactName.trim() : ''
    if (!contactName) return NextResponse.json({ error: 'contactName is required' }, { status: 400 })

    const id = randomUUID()
    await sql`
      INSERT INTO bo_customers (id, organization_id, company_name, contact_name, phone, email, address)
      VALUES (${id}, ${org.id}, ${body.companyName || null}, ${contactName}, ${body.phone || null}, ${body.email || null}, ${body.address || null})
    `
    await triggerWebhooks(sql, org.id, 'customer.created', { customerId: id, contactName })

    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
