import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { calculatePayDeductions, calculateOvertimeCents, PERIODS_PER_YEAR, type PayFrequency } from '@/lib/barioOnePayroll'
import type { ProvinceKey } from '@/lib/payrollTaxTables2026'
import type { BoEmployee, BoPayRun, BoTimeEntry } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

const VALID_FREQUENCIES: PayFrequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly']

export async function GET() {
  try {
    const auth = await requireBoModule('payroll')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM bo_pay_runs WHERE organization_id = ${org.id} ORDER BY pay_period_start DESC`) as unknown as BoPayRun[]
    return NextResponse.json({ payRuns: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Builds a full draft pay run in one call: for every active employee with
// a province set, computes real hours worked from bo_time_entries (Phase
// 5's time clock) for hourly staff, or a per-period salary share for
// salaried staff, runs it through the real 2026 tax tables, and inserts
// one itemized pay stub per employee. Employees missing a province are
// deliberately skipped (never guessed) and reported back so nothing gets
// silently mis-withheld.
export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('payroll')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can run payroll' }, { status: 403 })
    }

    const { frequency, payPeriodStart, payPeriodEnd, payDate } = await req.json()
    if (!VALID_FREQUENCIES.includes(frequency)) return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 })
    if (!payPeriodStart || !payPeriodEnd || !payDate) return NextResponse.json({ error: 'payPeriodStart, payPeriodEnd, and payDate are required' }, { status: 400 })
    if (new Date(payPeriodEnd) < new Date(payPeriodStart)) return NextResponse.json({ error: 'Pay period end must be on or after start' }, { status: 400 })

    const employees = (await sql`SELECT * FROM bo_employees WHERE organization_id = ${org.id} AND status = 'active'`) as unknown as BoEmployee[]

    const skipped: string[] = []
    const payRunId = randomUUID()

    await sql.begin(async (tx: any) => {
      await tx`
        INSERT INTO bo_pay_runs (id, organization_id, frequency, pay_period_start, pay_period_end, pay_date, created_by_user_id)
        VALUES (${payRunId}, ${org.id}, ${frequency}, ${payPeriodStart}, ${payPeriodEnd}, ${payDate}, ${user.id})
      `

      for (const employee of employees) {
        if (!employee.province) {
          skipped.push(`${employee.name} (no province set)`)
          continue
        }

        let regularHours = 0
        let overtimeHours = 0
        let regularCents = 0
        let overtimeCents = 0

        if (employee.pay_type === 'hourly') {
          const entries = (await tx`
            SELECT * FROM bo_time_entries
            WHERE employee_id = ${employee.id} AND clock_out IS NOT NULL
              AND clock_in >= ${payPeriodStart} AND clock_in <= ${payPeriodEnd}
          `) as unknown as BoTimeEntry[]
          const totalHours = entries.reduce((sum, e) => sum + (new Date(e.clock_out!).getTime() - new Date(e.clock_in).getTime()) / (1000 * 60 * 60), 0)
          const split = calculateOvertimeCents(totalHours, employee.hourly_rate_cents ?? 0)
          regularHours = Math.max(0, totalHours - Math.max(0, totalHours - 44))
          overtimeHours = Math.max(0, totalHours - 44)
          regularCents = split.regularCents
          overtimeCents = split.overtimeCents
        } else {
          regularCents = Math.round((employee.salary_cents ?? 0) / PERIODS_PER_YEAR[frequency as PayFrequency])
        }

        const preVacationGrossCents = regularCents + overtimeCents
        const vacationPayCents = Math.round(preVacationGrossCents * (Number(employee.vacation_pay_percent) / 100))
        const grossCents = preVacationGrossCents + vacationPayCents

        const deductions = calculatePayDeductions(grossCents, frequency as PayFrequency, employee.province as ProvinceKey)

        await tx`
          INSERT INTO bo_pay_stubs (
            id, organization_id, pay_run_id, employee_id, province, regular_hours, overtime_hours,
            regular_cents, overtime_cents, vacation_pay_cents, gross_cents,
            federal_tax_cents, provincial_tax_cents, cpp_or_qpp_cents, ei_cents, qpip_cents, net_pay_cents
          ) VALUES (
            ${randomUUID()}, ${org.id}, ${payRunId}, ${employee.id}, ${employee.province}, ${regularHours}, ${overtimeHours},
            ${regularCents}, ${overtimeCents}, ${vacationPayCents}, ${grossCents},
            ${deductions.federalTaxCents}, ${deductions.provincialTaxCents}, ${deductions.cppOrQppCents}, ${deductions.eiCents}, ${deductions.qpipCents}, ${deductions.netPayCents}
          )
        `
      }
    })

    return NextResponse.json({ ok: true, id: payRunId, skipped })
  } catch (err: any) {
    return errorResponse(err)
  }
}
