import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`DELETE FROM bo_invoices WHERE id = ${params.id} RETURNING id, number`) as unknown as { id: string; number: string }[]
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await logAdminAction(sql, { action: 'bario-one-invoice-deleted', params: { invoiceId: params.id, number: rows[0].number }, result: 'ok' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
