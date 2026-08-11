import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can approve or deny requests' }, { status: 403 })
    }

    const { status } = await req.json()
    if (status !== 'approved' && status !== 'denied') {
      return NextResponse.json({ error: 'status must be approved or denied' }, { status: 400 })
    }

    await sql`UPDATE bo_vacation_requests SET status = ${status}, updated_at = now() WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
