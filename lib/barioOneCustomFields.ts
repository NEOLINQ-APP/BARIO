import type { BoCustomField, BoCustomFieldEntity, BoCustomFieldType } from '@/lib/db'

export const CUSTOM_FIELD_TYPES: BoCustomFieldType[] = ['text', 'number', 'date', 'select', 'checkbox']

function coerceValue(fieldType: BoCustomFieldType, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null
  switch (fieldType) {
    case 'number': {
      const n = Number(value)
      return Number.isFinite(n) ? n : null
    }
    case 'checkbox':
      return Boolean(value)
    case 'date':
      return typeof value === 'string' ? value : null
    default:
      return String(value)
  }
}

// Merges only keys that match a real field definition for this org+entity —
// an unknown or stale field id in the incoming payload is silently dropped
// rather than polluting the JSON blob with orphaned keys.
export async function mergeCustomFieldValues(
  sql: any,
  organizationId: string,
  entityType: BoCustomFieldEntity,
  existingJson: string,
  incoming: unknown
): Promise<string> {
  const current = JSON.parse(existingJson || '{}') as Record<string, unknown>
  if (incoming === undefined) return JSON.stringify(current)
  if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) return JSON.stringify(current)

  const defs = (await sql`
    SELECT id, field_type FROM bo_custom_fields WHERE organization_id = ${organizationId} AND entity_type = ${entityType}
  `) as unknown as Pick<BoCustomField, 'id' | 'field_type'>[]
  const defById = new Map(defs.map((d) => [d.id, d.field_type]))

  for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
    const fieldType = defById.get(key)
    if (!fieldType) continue
    current[key] = coerceValue(fieldType, value)
  }
  return JSON.stringify(current)
}
