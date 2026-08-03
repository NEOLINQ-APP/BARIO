import { db, type MarketingConnection, type MarketingPlatform } from '@/lib/db'

type Sql = Awaited<ReturnType<typeof db>>

// Instagram rides on the Facebook connection (same Page token) — see the
// comment on MarketingConnection in lib/db.ts.
function storageKey(platform: MarketingPlatform): MarketingPlatform {
  return platform === 'instagram' ? 'facebook' : platform
}

export async function getConnection(sql: Sql, platform: MarketingPlatform): Promise<MarketingConnection | null> {
  const rows = (await sql`SELECT * FROM marketing_connections WHERE platform = ${storageKey(platform)}`) as unknown as MarketingConnection[]
  return rows[0] ?? null
}

export async function saveConnection(
  sql: Sql,
  platform: MarketingPlatform,
  data: {
    accessToken: string
    accessTokenSecret?: string | null
    refreshToken?: string | null
    expiresAt?: Date | null
    metadata?: Record<string, string>
  },
  connectedByUserId: string | null
): Promise<void> {
  const key = storageKey(platform)
  await sql`
    INSERT INTO marketing_connections (platform, access_token, access_token_secret, refresh_token, expires_at, metadata_json, connected_by, connected_at)
    VALUES (${key}, ${data.accessToken}, ${data.accessTokenSecret ?? null}, ${data.refreshToken ?? null}, ${data.expiresAt ?? null}, ${JSON.stringify(data.metadata ?? {})}, ${connectedByUserId}, now())
    ON CONFLICT (platform) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      access_token_secret = EXCLUDED.access_token_secret,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at,
      metadata_json = EXCLUDED.metadata_json,
      connected_by = EXCLUDED.connected_by,
      connected_at = now()
  `
}

export async function deleteConnection(sql: Sql, platform: MarketingPlatform): Promise<void> {
  await sql`DELETE FROM marketing_connections WHERE platform = ${storageKey(platform)}`
}

// Instagram is only really connected once its IG Business Account ID has
// been resolved onto the shared Facebook connection's metadata.
export async function isConnected(sql: Sql, platform: MarketingPlatform): Promise<boolean> {
  const conn = await getConnection(sql, platform)
  if (!conn) return false
  if (platform === 'instagram') {
    const meta = JSON.parse(conn.metadata_json || '{}')
    return !!meta.igUserId
  }
  return true
}
