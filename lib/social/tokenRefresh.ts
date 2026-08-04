import type { db as dbFn, SocialConnection } from '@/lib/db'
import { refreshMetaConnection } from '@/lib/social/meta'
import { refreshTikTokConnection } from '@/lib/social/tiktok'
import { refreshLinkedInConnection } from '@/lib/social/linkedin'

type Sql = Awaited<ReturnType<typeof dbFn>>

// Run daily (see app/api/cron/social-token-refresh). Refreshing every
// connection on every run rather than filtering to "expires soon" — TikTok
// access tokens only live ~24h, so a 6/12h cron cadence would need
// expires_at filtering to matter; at daily cadence, every TikTok connection
// needs a refresh attempt every single run regardless, and Meta/LinkedIn
// refreshes are no-ops when there's nothing to renew. Simpler than tracking
// a threshold, and TikTok's refresh_token itself lasts ~365 days so this
// doesn't risk exhausting it.
export async function refreshAllSocialConnections(sql: Sql): Promise<{ userId: string; platform: string; ok: boolean; error?: string }[]> {
  const connections = (await sql`SELECT DISTINCT user_id, platform FROM social_connections`) as unknown as Pick<SocialConnection, 'user_id' | 'platform'>[]

  const results: { userId: string; platform: string; ok: boolean; error?: string }[] = []
  for (const conn of connections) {
    try {
      if (conn.platform === 'facebook') await refreshMetaConnection(sql, conn.user_id)
      else if (conn.platform === 'tiktok') await refreshTikTokConnection(sql, conn.user_id)
      else if (conn.platform === 'linkedin') await refreshLinkedInConnection(sql, conn.user_id)
      results.push({ userId: conn.user_id, platform: conn.platform, ok: true })
    } catch (err: any) {
      results.push({ userId: conn.user_id, platform: conn.platform, ok: false, error: err.message })
    }
  }
  return results
}
