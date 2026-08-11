import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { CUSTOM_FIELD_TYPES } from '@/lib/barioOneCustomFields'
import type { BoCustomField, BoCustomFieldEntity } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

const VALID_ENTITIES: BoCustomFieldEntity[] = ['customer', 'deal']

export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const entityType = new URL(req.url).searchParams.get('entityType')
    const rows = (
      entityType
        ? await sql`SELECT * FROM bo_custom_fields WHERE organization_id = ${org.id} AND entity_type = ${entityType} ORDER BY position ASC, created_at ASC`
        : await sql`SELECT * FROM bo_custom_fields WHERE organization_id = ${org.id} ORDER BY entity_type ASC, position ASC, created_at ASC`
    ) as unknown as BoCustomField[]

    return NextResponse.json({ fields: rows.map((f) => ({ ...f, options: JSON.parse(f.options_json) })) })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can manage custom fields' }, { status: 403 })
    }

    const { entityType, name, fieldType, options } = await req.json()
    if (!VALID_ENTITIES.includes(entityType)) {
      return NextResponse.json({ error: 'entityType must be "customer" or "deal"' }, { status: 400 })
    }
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!CUSTOM_FIELD_TYPES.includes(fieldType)) {
      return NextResponse.json({ error: `fieldType must be one of: ${CUSTOM_FIELD_TYPES.join(', ')}` }, { status: 400 })
    }
    const optionsJson = JSON.stringify(
      fieldType === 'select' && Array.isArray(options) ? options.filter((o: any) => typeof o === 'string' && o.trim()) : []
    )

    const posRows = (await sql`
      SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM bo_custom_fields WHERE organization_id = ${org.id} AND entity_type = ${entityType}
    `) as unknown as { next_position: number }[]
    const position = posRows[0]?.next_position ?? 0

    const id = randomUUID()
    await sql`
      INSERT INTO bo_custom_fields (id, organization_id, entity_type, name, field_type, options_json, position)
      VALUES (${id}, ${org.id}, ${entityType}, ${name.trim()}, ${fieldType}, ${optionsJson}, ${position})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
