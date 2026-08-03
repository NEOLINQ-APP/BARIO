import { getConnection } from '@/lib/marketing/connections'
import type { db as dbFn } from '@/lib/db'

type Sql = Awaited<ReturnType<typeof dbFn>>

const GRAPH_API = 'https://graph.facebook.com/v21.0'

export async function postToFacebook(sql: Sql, content: string): Promise<string> {
  const conn = await getConnection(sql, 'facebook')
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

// Instagram's Content Publishing API requires media — there's no text-only
// post type — so we generate a styled placeholder graphic the same honest
// way the AI site builder does (placehold.co, never claimed to be a real photo).
export async function postToInstagram(sql: Sql, content: string): Promise<string> {
  const conn = await getConnection(sql, 'facebook') // Instagram rides the same Meta connection
  if (!conn) throw new Error('Instagram is not connected')
  const meta = JSON.parse(conn.metadata_json || '{}')
  const igUserId = meta.igUserId
  if (!igUserId) throw new Error('Instagram is connected but no linked Instagram Business Account was found')

  const snippet = content.slice(0, 60)
  const imageUrl = `https://placehold.co/1080x1080/0A2342/ffffff?text=${encodeURIComponent(snippet)}`

  const createRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption: content, access_token: conn.access_token }),
  })
  const createData = await createRes.json()
  if (!createRes.ok) throw new Error(createData.error?.message || 'Failed to create Instagram media')

  const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creation_id: createData.id, access_token: conn.access_token }),
  })
  const publishData = await publishRes.json()
  if (!publishRes.ok) throw new Error(publishData.error?.message || 'Failed to publish Instagram post')
  return publishData.id
}
