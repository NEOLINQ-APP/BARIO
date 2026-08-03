import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import type { Staff, Paystub } from '@/lib/db'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM staff WHERE id = ${params.id}`) as unknown as Staff[]
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const paystubs = (await sql`SELECT * FROM paystubs WHERE staff_id = ${params.id} ORDER BY pay_date DESC`) as unknown as Paystub[]
    return NextResponse.json({ ok: true, staff: rows[0], paystubs })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM staff WHERE id = ${params.id}`) as unknown as Staff[]
    const staff = rows[0]
    if (!staff) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    await sql`
      UPDATE staff SET
        name = ${typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : staff.name},
        email = ${body?.email !== undefined ? (body.email?.trim().toLowerCase() || null) : staff.email},
        address = ${body?.address !== undefined ? body.address : staff.address},
        province = ${typeof body?.province === 'string' && body.province ? body.province : staff.province},
        pay_type = ${body?.payType === 'salary' || body?.payType === 'hourly' ? body.payType : staff.pay_type},
        pay_rate_cents = ${body?.payRateCents !== undefined ? Math.round(Number(body.payRateCents)) : staff.pay_rate_cents},
        pay_frequency = ${['weekly', 'biweekly', 'semimonthly', 'monthly'].includes(body?.payFrequency) ? body.payFrequency : staff.pay_frequency},
        federal_claim_amount_cents = ${body?.federalClaimAmountCents !== undefined ? (body.federalClaimAmountCents != null ? Math.round(Number(body.federalClaimAmountCents)) : null) : staff.federal_claim_amount_cents},
        provincial_claim_amount_cents = ${body?.provincialClaimAmountCents !== undefined ? (body.provincialClaimAmountCents != null ? Math.round(Number(body.provincialClaimAmountCents)) : null) : staff.provincial_claim_amount_cents},
        status = ${['active', 'inactive'].includes(body?.status) ? body.status : staff.status}
      WHERE id = ${staff.id}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    await sql`DELETE FROM staff WHERE id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
