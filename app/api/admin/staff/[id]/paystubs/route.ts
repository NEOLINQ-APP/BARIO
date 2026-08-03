import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { calculatePayDeductions, type PayFrequency } from '@/lib/payrollCRA'
import { errorResponse } from '@/lib/errors'
import type { Staff, Paystub } from '@/lib/db'

type LineItem = { label: string; amountCents: number }

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const staffRows = (await sql`SELECT * FROM staff WHERE id = ${params.id}`) as unknown as Staff[]
    const staff = staffRows[0]
    if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const payPeriodStart = String(body?.payPeriodStart ?? '')
    const payPeriodEnd = String(body?.payPeriodEnd ?? '')
    const payDate = String(body?.payDate ?? '')
    if (!payPeriodStart || !payPeriodEnd || !payDate) {
      return NextResponse.json({ error: 'payPeriodStart, payPeriodEnd, and payDate are required' }, { status: 400 })
    }

    const province = typeof body?.province === 'string' && body.province ? body.province : staff.province
    const grossBaseCents = Math.round(Number(body?.grossPayCents) || 0)
    const bonuses: LineItem[] = Array.isArray(body?.bonuses) ? body.bonuses : []
    const additionalDeductions: LineItem[] = Array.isArray(body?.additionalDeductions) ? body.additionalDeductions : []
    const bonusTotal = bonuses.reduce((sum, b) => sum + Math.round(Number(b.amountCents) || 0), 0)
    const additionalDeductionTotal = additionalDeductions.reduce((sum, d) => sum + Math.round(Number(d.amountCents) || 0), 0)
    const grossPayCents = grossBaseCents + bonusTotal

    // Find the most recent paystub THIS calendar year for this staff
    // member — CPP/CPP2/EI annual maximums and YTD totals reset each Jan 1.
    const payYear = new Date(payDate).getFullYear()
    const priorRows = (await sql`
      SELECT * FROM paystubs
      WHERE staff_id = ${staff.id} AND EXTRACT(YEAR FROM pay_date) = ${payYear}
      ORDER BY pay_date DESC, created_at DESC LIMIT 1
    `) as unknown as Paystub[]
    const prior = priorRows[0]

    const deductions = calculatePayDeductions({
      grossPayCents,
      frequency: staff.pay_frequency as PayFrequency,
      provinceCode: province,
      ytdPensionableCents: prior?.ytd_pensionable_cents ?? 0,
      ytdInsurableCents: prior?.ytd_insurable_cents ?? 0,
      federalClaimAmountCents: staff.federal_claim_amount_cents ?? undefined,
      provincialClaimAmountCents: staff.provincial_claim_amount_cents ?? undefined,
    })

    const netPayCents = deductions.netPayCents - additionalDeductionTotal
    const totalDeductionsThisStub = deductions.totalDeductionsCents + additionalDeductionTotal

    const id = randomUUID()
    await sql`
      INSERT INTO paystubs (
        id, staff_id, pay_period_start, pay_period_end, pay_date, province,
        gross_pay_cents, bonuses_json, additional_deductions_json,
        cpp_cents, cpp2_cents, ei_cents, federal_tax_cents, provincial_tax_cents,
        net_pay_cents, ytd_gross_cents, ytd_pensionable_cents, ytd_insurable_cents, ytd_deductions_cents, ytd_net_cents
      ) VALUES (
        ${id}, ${staff.id}, ${payPeriodStart}, ${payPeriodEnd}, ${payDate}, ${province},
        ${grossPayCents}, ${JSON.stringify(bonuses)}, ${JSON.stringify(additionalDeductions)},
        ${deductions.cppCents}, ${deductions.cpp2Cents}, ${deductions.eiCents}, ${deductions.federalTaxCents}, ${deductions.provincialTaxCents},
        ${netPayCents},
        ${(prior?.ytd_gross_cents ?? 0) + grossPayCents},
        ${(prior?.ytd_pensionable_cents ?? 0) + deductions.pensionableThisPeriodCents},
        ${(prior?.ytd_insurable_cents ?? 0) + deductions.insurableThisPeriodCents},
        ${(prior?.ytd_deductions_cents ?? 0) + totalDeductionsThisStub},
        ${(prior?.ytd_net_cents ?? 0) + netPayCents}
      )
    `

    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return errorResponse(err)
  }
}
