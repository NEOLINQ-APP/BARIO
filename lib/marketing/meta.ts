const GRAPH_API = 'https://graph.facebook.com/v21.0'

export async function postToFacebook(content: string): Promise<string> {
  const pageId = process.env.META_PAGE_ID!
  const token = process.env.META_PAGE_ACCESS_TOKEN!

  const res = await fetch(`${GRAPH_API}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: content, access_token: token }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to post to Facebook')
  return data.id
}

// Instagram's Content Publishing API requires media — there's no text-only
// post type — so we generate a styled placeholder graphic the same honest
// way the AI site builder does (placehold.co, never claimed to be a real photo).
export async function postToInstagram(content: string): Promise<string> {
  const igUserId = process.env.META_IG_USER_ID!
  const token = process.env.META_PAGE_ACCESS_TOKEN!

  const snippet = content.slice(0, 60)
  const imageUrl = `https://placehold.co/1080x1080/0A2342/ffffff?text=${encodeURIComponent(snippet)}`

  const createRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption: content, access_token: token }),
  })
  const createData = await createRes.json()
  if (!createRes.ok) throw new Error(createData.error?.message || 'Failed to create Instagram media')

  const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creation_id: createData.id, access_token: token }),
  })
  const publishData = await publishRes.json()
  if (!publishRes.ok) throw new Error(publishData.error?.message || 'Failed to publish Instagram post')
  return publishData.id
}
