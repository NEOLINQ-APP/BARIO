import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import type { BoEmployee } from '@/lib/db'
import { syncPayrollQuantity } from '@/lib/barioOnePayrollBilling'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM bo_employees WHERE organization_id = ${org.id} ORDER BY created_at DESC`) as unknown as BoEmployee[]
    return NextResponse.json({ employees: rows.map((e) => ({ ...e, documents: JSON.parse(e.document_urls_json) })) })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can add employees' }, { status: 403 })
    }

    const { name, email, phone, position, payType, salaryCents, hourlyRateCents } = await req.json()
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    const resolvedPayType = payType === 'salary' ? 'salary' : 'hourly'

    const id = randomUUID()
    await sql`
      INSERT INTO bo_employees (id, organization_id, name, email, phone, position, pay_type, salary_cents, hourly_rate_cents)
      VALUES (
        ${id}, ${org.id}, ${name.trim()}, ${email || null}, ${phone || null}, ${position || null}, ${resolvedPayType},
        ${resolvedPayType === 'salary' && Number.isFinite(salaryCents) ? Math.round(salaryCents) : null},
        ${resolvedPayType === 'hourly' && Number.isFinite(hourlyRateCents) ? Math.round(hourlyRateCents) : null}
      )
    `
    await syncPayrollQuantity(sql, org)
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
