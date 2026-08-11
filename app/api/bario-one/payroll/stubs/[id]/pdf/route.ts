import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { generatePayStubPdf, dateStr } from '@/lib/barioOnePayroll'
import type { BoPayStub, BoEmployee, BoPayRun } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('payroll')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const stubRows = (await sql`SELECT * FROM bo_pay_stubs WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoPayStub[]
    const stub = stubRows[0]
    if (!stub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const employeeRows = (await sql`SELECT * FROM bo_employees WHERE id = ${stub.employee_id}`) as unknown as BoEmployee[]
    const payRunRows = (await sql`SELECT * FROM bo_pay_runs WHERE id = ${stub.pay_run_id}`) as unknown as BoPayRun[]
    const employee = employeeRows[0]
    const payRun = payRunRows[0]
    if (!employee || !payRun) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const pdfBytes = await generatePayStubPdf(org, employee, payRun, stub)
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="paystub-${employee.name.replace(/\s+/g, '-')}-${dateStr(payRun.pay_date)}.pdf"` },
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
