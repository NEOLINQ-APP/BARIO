import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { CUSTOM_FIELD_TYPES } from '@/lib/barioOneCustomFields'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can manage custom fields' }, { status: 403 })
    }

    const existing = (await sql`SELECT id, field_type FROM bo_custom_fields WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { id: string; field_type: string }[]
    if (existing.length === 0) return NextResponse.json({ error: 'Field not found' }, { status: 404 })

    const { name, options, position } = await req.json()
    const fieldType = existing[0].field_type
    const optionsJson =
      options !== undefined
        ? JSON.stringify(fieldType === 'select' && Array.isArray(options) ? options.filter((o: any) => typeof o === 'string' && o.trim()) : [])
        : null

    await sql`
      UPDATE bo_custom_fields SET
        name = COALESCE(${typeof name === 'string' && name.trim() ? name.trim() : null}, name),
        options_json = COALESCE(${optionsJson}, options_json),
        position = COALESCE(${Number.isFinite(position) ? Math.round(position) : null}, position),
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
      return NextResponse.json({ error: 'Only owners and admins can manage custom fields' }, { status: 403 })
    }

    await sql`DELETE FROM bo_custom_fields WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
