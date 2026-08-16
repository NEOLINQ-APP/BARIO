import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { PROVINCE_KEYS } from '@/lib/barioOnePayroll'
import { syncPayrollQuantity } from '@/lib/barioOnePayrollBilling'
import type { BoEmployee, BoTimeEntry, BoShift, BoVacationRequest, BoEmployeeNote } from '@/lib/db'
import type { ProvinceKey } from '@/lib/payrollTaxTables2026'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM bo_employees WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoEmployee[]
    const employee = rows[0]
    if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const timeEntries = (await sql`
      SELECT * FROM bo_time_entries WHERE employee_id = ${employee.id} ORDER BY clock_in DESC LIMIT 50
    `) as unknown as BoTimeEntry[]
    const shifts = (await sql`
      SELECT * FROM bo_shifts WHERE employee_id = ${employee.id} ORDER BY starts_at DESC LIMIT 50
    `) as unknown as BoShift[]
    const vacation = (await sql`
      SELECT * FROM bo_vacation_requests WHERE employee_id = ${employee.id} ORDER BY start_date DESC
    `) as unknown as BoVacationRequest[]
    const notes = (await sql`
      SELECT n.*, u.email as author_email FROM bo_employee_notes n
      LEFT JOIN users u ON u.id = n.author_user_id
      WHERE n.employee_id = ${employee.id} ORDER BY n.created_at DESC
    `) as unknown as (BoEmployeeNote & { author_email: string | null })[]

    return NextResponse.json({
      employee: { ...employee, documents: JSON.parse(employee.document_urls_json) },
      timeEntries,
      shifts,
      vacation,
      notes,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can edit employees' }, { status: 403 })
    }

    const existing = (await sql`SELECT id FROM bo_employees WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
    if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { name, email, phone, position, payType, salaryCents, hourlyRateCents, status, province, vacationPayPercent } = await req.json()
    const validProvince = typeof province === 'string' && PROVINCE_KEYS.includes(province as ProvinceKey) ? province : null

    await sql`
      UPDATE bo_employees SET
        name = COALESCE(${name || null}, name),
        email = ${email ?? null},
        phone = ${phone ?? null},
        position = ${position ?? null},
        pay_type = COALESCE(${payType === 'salary' || payType === 'hourly' ? payType : null}, pay_type),
        salary_cents = COALESCE(${Number.isFinite(salaryCents) ? Math.round(salaryCents) : null}, salary_cents),
        hourly_rate_cents = COALESCE(${Number.isFinite(hourlyRateCents) ? Math.round(hourlyRateCents) : null}, hourly_rate_cents),
        status = COALESCE(${status === 'active' || status === 'inactive' ? status : null}, status),
        province = COALESCE(${validProvince}, province),
        vacation_pay_percent = COALESCE(${Number.isFinite(vacationPayPercent) ? vacationPayPercent : null}, vacation_pay_percent),
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
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the account owner can remove employees' }, { status: 403 })
    }

    await sql`DELETE FROM bo_employee_notes WHERE employee_id = ${params.id} AND organization_id = ${org.id}`
    await sql`DELETE FROM bo_vacation_requests WHERE employee_id = ${params.id} AND organization_id = ${org.id}`
    await sql`DELETE FROM bo_shifts WHERE employee_id = ${params.id} AND organization_id = ${org.id}`
    await sql`DELETE FROM bo_time_entries WHERE employee_id = ${params.id} AND organization_id = ${org.id}`
    await sql`DELETE FROM bo_employees WHERE id = ${params.id} AND organization_id = ${org.id}`
    await syncPayrollQuantity(sql, org)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
