import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import type { Staff } from '@/lib/db'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const staff = (await sql`SELECT * FROM staff ORDER BY name`) as unknown as Staff[]
    return NextResponse.json({ ok: true, staff })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const id = randomUUID()
    await sql`
      INSERT INTO staff (id, name, email, address, province, pay_type, pay_rate_cents, pay_frequency, federal_claim_amount_cents, provincial_claim_amount_cents)
      VALUES (
        ${id}, ${name},
        ${typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null},
        ${typeof body?.address === 'string' ? body.address.trim() : null},
        ${typeof body?.province === 'string' && body.province ? body.province : 'AB'},
        ${body?.payType === 'salary' ? 'salary' : 'hourly'},
        ${Math.round(Number(body?.payRateCents) || 0)},
        ${['weekly', 'biweekly', 'semimonthly', 'monthly'].includes(body?.payFrequency) ? body.payFrequency : 'biweekly'},
        ${body?.federalClaimAmountCents != null ? Math.round(Number(body.federalClaimAmountCents)) : null},
        ${body?.provincialClaimAmountCents != null ? Math.round(Number(body.provincialClaimAmountCents)) : null}
      )
    `
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return errorResponse(err)
  }
}
