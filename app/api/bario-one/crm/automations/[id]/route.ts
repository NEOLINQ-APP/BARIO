import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can manage automations' }, { status: 403 })
    }

    const existing = (await sql`SELECT id FROM bo_automations WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
    if (existing.length === 0) return NextResponse.json({ error: 'Automation not found' }, { status: 404 })

    const { name, status } = await req.json()
    if (status !== undefined && !['active', 'paused'].includes(status)) {
      return NextResponse.json({ error: 'status must be "active" or "paused"' }, { status: 400 })
    }

    await sql`
      UPDATE bo_automations SET
        name = COALESCE(${typeof name === 'string' && name.trim() ? name.trim() : null}, name),
        status = COALESCE(${status || null}, status),
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
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can manage automations' }, { status: 403 })
    }

    await sql`DELETE FROM bo_automations WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
