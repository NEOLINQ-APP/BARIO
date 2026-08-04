import { getSocialConnection } from '@/lib/social/connections'
import type { db as dbFn } from '@/lib/db'

type Sql = Awaited<ReturnType<typeof dbFn>>

const TIKTOK_API = 'https://open.tiktokapis.com/v2'

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function tiktokFetch(path: string, accessToken: string, body: Record<string, unknown>) {
  const res = await fetch(`${TIKTOK_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok || data.error?.code !== 'ok') {
    throw new Error(data.error?.message || `TikTok API error (${res.status})`)
  }
  return data.data
}

// TikTok requires querying which privacy levels this specific creator is
// allowed to post with before every publish call (their compliance
// requirement — an app can't just hardcode PUBLIC_TO_EVERYONE). Unaudited
// apps (no approved "Direct Post" scope yet) additionally force every post
// into the creator's TikTok inbox as a draft for manual review, regardless
// of privacy_level — see the comment on publishVideo below.
async function getAllowedPrivacyLevel(accessToken: string): Promise<string> {
  const info = await tiktokFetch('/post/publish/creator_info/query/', accessToken, {})
  const options: string[] = info?.privacy_level_options ?? []
  if (options.includes('SELF_ONLY')) return 'SELF_ONLY'
  return options[0] ?? 'SELF_ONLY'
}

export type TikTokPublishResult = { publishId: string; landedInInbox: boolean }

// Real caveat, not a bug: until Bario's TikTok developer app is granted the
// audited "Direct Post" scope, TikTok forces every API-published video into
// the connected creator's TikTok app inbox as a draft — it does NOT go live
// automatically no matter what privacy_level says. landedInInbox reflects
// TikTok's actual publish status so the UI can tell the customer "check your
// TikTok app to finish posting" instead of falsely claiming it's live.
export async function publishTikTokVideo(sql: Sql, userId: string, opts: { videoUrl: string; caption: string }): Promise<TikTokPublishResult> {
  const conn = await getSocialConnection(sql, userId, 'tiktok')
  if (!conn) throw new Error('TikTok is not connected')

  const privacyLevel = await getAllowedPrivacyLevel(conn.access_token)

  const initData = await tiktokFetch('/post/publish/video/init/', conn.access_token, {
    post_info: {
      title: opts.caption,
      privacy_level: privacyLevel,
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000,
    },
    source_info: { source: 'PULL_FROM_URL', video_url: opts.videoUrl },
  })
  const publishId: string = initData.publish_id

  // Poll publish status the same way lib/social/meta.ts polls Meta's media
  // container — PULL_FROM_URL means TikTok fetches the file itself
  // (PROCESSING_DOWNLOAD) before it can process/publish it, so the init
  // call returning a publish_id does not mean the post exists yet.
  let landedInInbox = false
  for (let attempt = 0; attempt < 24; attempt++) {
    const status = await tiktokFetch('/post/publish/status/fetch/', conn.access_token, { publish_id: publishId })
    if (status.status === 'PUBLISH_COMPLETE') break
    if (status.status === 'SEND_TO_USER_INBOX') {
      landedInInbox = true
      break
    }
    if (status.status === 'FAILED') {
      throw new Error(status.fail_reason || 'TikTok failed to process the video')
    }
    await sleep(5000)
  }

  return { publishId, landedInInbox }
}

export async function refreshTikTokConnection(sql: Sql, userId: string): Promise<void> {
  const conn = await getSocialConnection(sql, userId, 'tiktok')
  if (!conn?.refresh_token) return
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  if (!clientKey || !clientSecret) return

  const res = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error_description || 'Failed to refresh TikTok token')

  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null
  await sql`
    UPDATE social_connections
    SET access_token = ${data.access_token}, refresh_token = ${data.refresh_token ?? conn.refresh_token}, expires_at = ${expiresAt}, updated_at = now()
    WHERE user_id = ${userId} AND platform = 'tiktok'
  `
}
