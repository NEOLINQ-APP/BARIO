import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Admin-Bearer equivalent of app/api/bario-one/crm/customers/[id]'s DELETE
// (session-gated) -- same cascade, for cleaning up a lead from the admin
// panel without needing a customer session.
export async function DELETE(req: Request, { params }: { params: { id: string; customerId: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    await sql`DELETE FROM bo_tasks WHERE customer_id = ${params.customerId} AND organization_id = ${params.id}`
    await sql`DELETE FROM bo_notes WHERE customer_id = ${params.customerId} AND organization_id = ${params.id}`
    await sql`DELETE FROM bo_deals WHERE customer_id = ${params.customerId} AND organization_id = ${params.id}`
    await sql`DELETE FROM bo_customers WHERE id = ${params.customerId} AND organization_id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
