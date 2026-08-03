import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { generatePaystubPdf } from '@/lib/paystubPdf'
import { errorResponse } from '@/lib/errors'
import type { Staff, Paystub } from '@/lib/db'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM paystubs WHERE id = ${params.id}`) as unknown as Paystub[]
    const stub = rows[0]
    if (!stub) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const staffRows = (await sql`SELECT * FROM staff WHERE id = ${stub.staff_id}`) as unknown as Staff[]
    const staff = staffRows[0]
    if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

    const pdfBytes = await generatePaystubPdf(sql, staff, stub)
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="paystub-${stub.pay_date}.pdf"` },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
