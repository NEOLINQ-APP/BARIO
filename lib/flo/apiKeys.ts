import { randomBytes, randomUUID } from 'node:crypto'
import { db, type FloApiKey } from '@/lib/db'
import { hashPersonalAccessToken } from '@/lib/session'

type Sql = Awaited<ReturnType<typeof db>>

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// flo_live_ prefix mirrors the stripe/sk_live_-style convention developers
// already recognize — makes an accidentally-committed key greppable/
// revocable-on-sight in a way an opaque random string isn't.
function generateRawKey(): string {
  return `flo_live_${base64url(randomBytes(24))}`
}

// Returns the raw key exactly once — same "shown once at creation, then
// only the hash is ever stored" shape as lib/session.ts's personal access
// tokens, just reused for a third party calling Bario instead of Bario's
// own sync client.
export async function createFloApiKey(sql: Sql, userId: string, crmStackId: string, name: string): Promise<{ id: string; rawKey: string }> {
  const rawKey = generateRawKey()
  const id = randomUUID()
  await sql`
    INSERT INTO flo_api_keys (id, user_id, crm_stack_id, name, key_prefix, key_hash, created_at)
    VALUES (${id}, ${userId}, ${crmStackId}, ${name}, ${rawKey.slice(0, 16)}, ${hashPersonalAccessToken(rawKey)}, now())
  `
  return { id, rawKey }
}

export async function listFloApiKeys(sql: Sql, userId: string): Promise<FloApiKey[]> {
  return (await sql`SELECT * FROM flo_api_keys WHERE user_id = ${userId} ORDER BY created_at DESC`) as unknown as FloApiKey[]
}

export async function revokeFloApiKey(sql: Sql, userId: string, keyId: string): Promise<void> {
  await sql`UPDATE flo_api_keys SET revoked_at = now() WHERE id = ${keyId} AND user_id = ${userId}`
}

export async function verifyFloApiKey(sql: Sql, rawKey: string): Promise<FloApiKey | null> {
  const rows = (await sql`
    SELECT * FROM flo_api_keys WHERE key_hash = ${hashPersonalAccessToken(rawKey)} AND revoked_at IS NULL
  `) as unknown as FloApiKey[]
  const key = rows[0]
  if (!key) return null
  await sql`UPDATE flo_api_keys SET last_used_at = now() WHERE id = ${key.id}`
  return key
}
