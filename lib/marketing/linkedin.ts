// LinkedIn's current Posts API (replaces the older ugcPosts endpoint).
export async function postToLinkedIn(content: string): Promise<string> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN!
  const orgUrn = process.env.LINKEDIN_ORG_URN! // e.g. "urn:li:organization:12345678"

  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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
