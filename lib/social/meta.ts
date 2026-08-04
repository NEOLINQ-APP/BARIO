import { getSocialConnection } from '@/lib/social/connections'
import type { db as dbFn } from '@/lib/db'

type Sql = Awaited<ReturnType<typeof dbFn>>

const GRAPH_API = 'https://graph.facebook.com/v21.0'

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Instagram/Facebook video publishing is NOT a single POST — the container
// has to finish server-side processing before it can be published. Polling
// immediately and treating "still processing" as success (rather than
// polling until FINISHED) is the exact bug that silently drops real posts
// once the video is more than a few seconds long. maxAttempts * delayMs
// gives ~2 minutes, generous for a short vertical ad clip; Vercel's
// maxDuration on the calling route must be set at least that high.
async function pollUntilFinished(
  containerId: string,
  accessToken: string,
  opts: { maxAttempts?: number; delayMs?: number } = {}
): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? 24
  const delayMs = opts.delayMs ?? 5000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${accessToken}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || 'Failed to check media processing status')

    if (data.status_code === 'FINISHED') return
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
      throw new Error(`Meta rejected the media during processing: ${data.status || data.status_code}`)
    }
    // IN_PROGRESS or PUBLISHED (video endpoint uses different status values
    // than the media-container endpoint) — keep polling.
    await sleep(delayMs)
  }
  throw new Error('Media is still processing after 2 minutes — try again shortly or use a smaller file')
}

export async function postFacebookVideo(
  sql: Sql,
  userId: string,
  opts: { videoUrl: string; caption: string }
): Promise<string> {
  const conn = await getSocialConnection(sql, userId, 'facebook')
  if (!conn) throw new Error('Facebook is not connected')
  const meta = JSON.parse(conn.metadata_json || '{}')
  const pageId = meta.pageId
  if (!pageId) throw new Error('Facebook is connected but no Page was found on it')

  // Uploading by file_url (rather than multipart bytes) starts async
  // processing on Meta's side immediately — the returned id exists before
  // the video is actually playable, hence the poll below.
  const res = await fetch(`${GRAPH_API}/${pageId}/videos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file_url: opts.videoUrl, description: opts.caption, access_token: conn.access_token }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to upload video to Facebook')

  await pollUntilFinished(data.id, conn.access_token)
  return data.id
}

// Text/link-only fallback for when there's no media attached.
export async function postFacebookFeed(sql: Sql, userId: string, content: string): Promise<string> {
  const conn = await getSocialConnection(sql, userId, 'facebook')
  if (!conn) throw new Error('Facebook is not connected')
  const meta = JSON.parse(conn.metadata_json || '{}')
  const pageId = meta.pageId
  if (!pageId) throw new Error('Facebook is connected but no Page was found on it')

  const res = await fetch(`${GRAPH_API}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: content, access_token: conn.access_token }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to post to Facebook')
  return data.id
}

// Real Reels publish flow: create container (video_url + media_type=REELS)
// -> poll until Meta finishes processing it -> publish. Calling
// media_publish before status_code is FINISHED returns a "not ready" error
// on anything but a trivially short clip, which is the bug in a naive
// single-POST implementation.
export async function postInstagramReel(
  sql: Sql,
  userId: string,
  opts: { videoUrl: string; caption: string }
): Promise<string> {
  const conn = await getSocialConnection(sql, userId, 'facebook') // Instagram rides the same Meta connection
  if (!conn) throw new Error('Instagram is not connected')
  const meta = JSON.parse(conn.metadata_json || '{}')
  const igUserId = meta.igUserId
  if (!igUserId) throw new Error('Instagram is connected but no linked Instagram Business Account was found')

  const createRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      video_url: opts.videoUrl,
      caption: opts.caption,
      media_type: 'REELS',
      access_token: conn.access_token,
    }),
  })
  const createData = await createRes.json()
  if (!createRes.ok) throw new Error(createData.error?.message || 'Failed to create Instagram Reel container')

  await pollUntilFinished(createData.id, conn.access_token)

  const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creation_id: createData.id, access_token: conn.access_token }),
  })
  const publishData = await publishRes.json()
  if (!publishRes.ok) throw new Error(publishData.error?.message || 'Failed to publish Instagram Reel')
  return publishData.id
}

export async function postInstagramImage(sql: Sql, userId: string, opts: { imageUrl: string; caption: string }): Promise<string> {
  const conn = await getSocialConnection(sql, userId, 'facebook')
  if (!conn) throw new Error('Instagram is not connected')
  const meta = JSON.parse(conn.metadata_json || '{}')
  const igUserId = meta.igUserId
  if (!igUserId) throw new Error('Instagram is connected but no linked Instagram Business Account was found')

  const createRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_url: opts.imageUrl, caption: opts.caption, access_token: conn.access_token }),
  })
  const createData = await createRes.json()
  if (!createRes.ok) throw new Error(createData.error?.message || 'Failed to create Instagram media')

  // Image containers usually finish near-instantly, but polling instead of
  // publishing blind costs one extra request and closes the same race a
  // slow-processing image (large file, high traffic on Meta's side) would
  // otherwise hit.
  await pollUntilFinished(createData.id, conn.access_token, { maxAttempts: 6, delayMs: 2000 })

  const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creation_id: createData.id, access_token: conn.access_token }),
  })
  const publishData = await publishRes.json()
  if (!publishRes.ok) throw new Error(publishData.error?.message || 'Failed to publish Instagram post')
  return publishData.id
}

// Page access tokens derived from a long-lived user token don't carry a
// fixed expiry in practice (Meta invalidates them only on password change,
// app revocation, or detected compromise) — expires_at is only ever set here
// if a future connect flow stores a shorter-lived token. Re-exchanging via
// fb_exchange_token is a best-effort renewal for that case; it's a no-op
// safety net, not something this flow depends on running on a strict clock.
export async function refreshMetaConnection(sql: Sql, userId: string): Promise<void> {
  const conn = await getSocialConnection(sql, userId, 'facebook')
  if (!conn) return
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) return

  const res = await fetch(
    `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${conn.access_token}`
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to refresh Meta token')

  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null
  await sql`UPDATE social_connections SET access_token = ${data.access_token}, expires_at = ${expiresAt}, updated_at = now() WHERE user_id = ${userId} AND platform = 'facebook'`
}
