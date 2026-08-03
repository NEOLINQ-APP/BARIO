import { getConnection } from '@/lib/marketing/connections'
import type { db as dbFn } from '@/lib/db'

type Sql = Awaited<ReturnType<typeof dbFn>>

// LinkedIn's current Posts API (replaces the older ugcPosts endpoint).
export async function postToLinkedIn(sql: Sql, content: string): Promise<string> {
  const conn = await getConnection(sql, 'linkedin')
  if (!conn) throw new Error('LinkedIn is not connected')
  const meta = JSON.parse(conn.metadata_json || '{}')
  const orgUrn = meta.orgUrn // e.g. "urn:li:organization:12345678"
  if (!orgUrn) throw new Error('LinkedIn is connected but no organization page was found on it')

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
      commentary: content,
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
  // LinkedIn returns the created post's URN in this response header, not the body.
  return res.headers.get('x-restli-id') || 'posted'
}
