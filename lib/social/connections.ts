import { randomUUID } from 'node:crypto'
import { db, type SocialConnection, type SocialPlatform } from '@/lib/db'

type Sql = Awaited<ReturnType<typeof db>>

// Instagram rides on the Facebook connection (same Page access token) — same
// pattern as lib/marketing/connections.ts, just per-user instead of global.
function storageKey(platform: SocialPlatform): SocialPlatform {
  return platform === 'instagram' ? 'facebook' : platform
}

export async function getSocialConnection(sql: Sql, userId: string, platform: SocialPlatform): Promise<SocialConnection | null> {
  const rows = (await sql`
    SELECT * FROM social_connections WHERE user_id = ${userId} AND platform = ${storageKey(platform)}
  `) as unknown as SocialConnection[]
  return rows[0] ?? null
}

export async function listSocialConnections(sql: Sql, userId: string): Promise<SocialConnection[]> {
  return (await sql`SELECT * FROM social_connections WHERE user_id = ${userId}`) as unknown as SocialConnection[]
}

export async function saveSocialConnection(
  sql: Sql,
  userId: string,
  platform: SocialPlatform,
  data: {
    accessToken: string
    refreshToken?: string | null
    expiresAt?: Date | null
    metadata?: Record<string, string>
  }
): Promise<void> {
  const key = storageKey(platform)
  await sql`
    INSERT INTO social_connections (id, user_id, platform, access_token, refresh_token, expires_at, metadata_json, connected_at, updated_at)
    VALUES (${randomUUID()}, ${userId}, ${key}, ${data.accessToken}, ${data.refreshToken ?? null}, ${data.expiresAt ?? null}, ${JSON.stringify(data.metadata ?? {})}, now(), now())
    ON CONFLICT (user_id, platform) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at,
      metadata_json = EXCLUDED.metadata_json,
      updated_at = now()
  `
}

export async function deleteSocialConnection(sql: Sql, userId: string, platform: SocialPlatform): Promise<void> {
  await sql`DELETE FROM social_connections WHERE user_id = ${userId} AND platform = ${storageKey(platform)}`
}

export async function setNotifyPhone(sql: Sql, userId: string, phone: string): Promise<void> {
  await sql`UPDATE social_connections SET notify_phone = ${phone}, updated_at = now() WHERE user_id = ${userId}`
}

// Instagram only counts as "connected" once its IG Business Account ID has
// been resolved onto the shared Facebook connection's metadata (not every
// Facebook Page has a linked Instagram Business Account).
export async function isSocialConnected(sql: Sql, userId: string, platform: SocialPlatform): Promise<boolean> {
  const conn = await getSocialConnection(sql, userId, platform)
  if (!conn) return false
  if (platform === 'instagram') {
    const meta = JSON.parse(conn.metadata_json || '{}')
    return !!meta.igUserId
  }
  return true
}

// Looks up which user owns a connected Facebook Page — used by the Lead Ads
// webhook, which only tells us the page_id, not which Bario account it
// belongs to. metadata_json->>'pageId' isn't indexed (this table is small
// and per-user unique on platform, so a full scan here is cheap); revisit
// with a real index if the connected-account count ever gets large.
export async function findUserByPageId(sql: Sql, pageId: string): Promise<SocialConnection | null> {
  const rows = (await sql`
    SELECT * FROM social_connections WHERE platform = 'facebook' AND metadata_json::jsonb ->> 'pageId' = ${pageId}
  `) as unknown as SocialConnection[]
  return rows[0] ?? null
}
