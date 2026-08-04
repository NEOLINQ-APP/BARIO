import { getSocialConnection } from '@/lib/social/connections'
import type { db as dbFn } from '@/lib/db'

type Sql = Awaited<ReturnType<typeof dbFn>>

// LinkedIn's current Posts API. Native video upload is a separate 3-step
// Video API (initializeUpload -> PUT bytes -> finalizeUpload) that needs the
// raw file bytes, not just a URL — out of scope for this pass. Posting the
// caption with the video URL appended lets LinkedIn's own link-unfurl
// generate a preview/thumbnail instead, which is a real, working post today
// rather than a half-built native upload.
export async function postToLinkedIn(sql: Sql, userId: string, opts: { caption: string; videoUrl?: string }): Promise<string> {
  const conn = await getSocialConnection(sql, userId, 'linkedin')
  if (!conn) throw new Error('LinkedIn is not connected')
  const meta = JSON.parse(conn.metadata_json || '{}')
  const orgUrn = meta.orgUrn
  if (!orgUrn) throw new Error('LinkedIn is connected but no organization page was found on it')

  const commentary = opts.videoUrl ? `${opts.caption}\n\n${opts.videoUrl}` : opts.caption

  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202405',
    },
    body: JSON.stringify({
      author: orgUrn,
      commentary,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || 'Failed to post to LinkedIn')
  }
  return res.headers.get('x-restli-id') || 'posted'
}

// Only works if the connect flow requested the offline_access scope — see
// app/api/social/connect/linkedin/route.ts. Without it LinkedIn issues no
// refresh_token and this is a no-op (matches lib/social/meta.ts's
// best-effort-renewal shape for the "nothing to refresh" case).
export async function refreshLinkedInConnection(sql: Sql, userId: string): Promise<void> {
  const conn = await getSocialConnection(sql, userId, 'linkedin')
  if (!conn?.refresh_token) return
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  if (!clientId || !clientSecret) return

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || 'Failed to refresh LinkedIn token')

  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null
  await sql`
    UPDATE social_connections
    SET access_token = ${data.access_token}, refresh_token = ${data.refresh_token ?? conn.refresh_token}, expires_at = ${expiresAt}, updated_at = now()
    WHERE user_id = ${userId} AND platform = 'linkedin'
  `
}
