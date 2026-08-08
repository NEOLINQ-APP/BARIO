import { randomBytes, randomUUID } from 'node:crypto'
import { db, type BoApiKey } from '@/lib/db'
import { hashPersonalAccessToken } from '@/lib/session'

type Sql = Awaited<ReturnType<typeof db>>

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// bo_flo_live_ prefix — distinguishable from the main platform's own
// flo_live_ keys (different table, different tenancy unit: organization_id
// here vs crm_stack_id there) so a leaked key is identifiable at a glance
// as a Bario One key specifically, same reasoning as the original prefix.
function generateRawKey(): string {
  return `bo_flo_live_${base64url(randomBytes(24))}`
}

// Raw key returned exactly once — only the hash is ever persisted, same
// "shown once at creation" shape as every other credential in this app
// (personal access tokens, the main Flo API, VPS root passwords).
export async function createBoApiKey(sql: Sql, organizationId: string, createdByUserId: string, name: string): Promise<{ id: string; rawKey: string }> {
  const rawKey = generateRawKey()
  const id = randomUUID()
  await sql`
    INSERT INTO bo_api_keys (id, organization_id, created_by_user_id, name, key_prefix, key_hash)
    VALUES (${id}, ${organizationId}, ${createdByUserId}, ${name}, ${rawKey.slice(0, 20)}, ${hashPersonalAccessToken(rawKey)})
  `
  return { id, rawKey }
}

export async function listBoApiKeys(sql: Sql, organizationId: string): Promise<BoApiKey[]> {
  return (await sql`SELECT * FROM bo_api_keys WHERE organization_id = ${organizationId} ORDER BY created_at DESC`) as unknown as BoApiKey[]
}

export async function revokeBoApiKey(sql: Sql, organizationId: string, keyId: string): Promise<void> {
  await sql`UPDATE bo_api_keys SET revoked_at = now() WHERE id = ${keyId} AND organization_id = ${organizationId}`
}

export async function verifyBoApiKey(sql: Sql, rawKey: string): Promise<BoApiKey | null> {
  const rows = (await sql`SELECT * FROM bo_api_keys WHERE key_hash = ${hashPersonalAccessToken(rawKey)} AND revoked_at IS NULL`) as unknown as BoApiKey[]
  const key = rows[0]
  if (!key) return null
  await sql`UPDATE bo_api_keys SET last_used_at = now() WHERE id = ${key.id}`
  return key
}
