import { createHmac, randomBytes } from 'node:crypto'

// X API v2 tweet creation requires user-context auth — OAuth 1.0a with a
// permanent access token/secret is the simplest fit for a single business
// account (no refresh flow needed, unlike OAuth 2.0 user tokens).
function oauth1Header(method: string, url: string, extraParams: Record<string, string> = {}) {
  const consumerKey = process.env.TWITTER_API_KEY!
  const consumerSecret = process.env.TWITTER_API_SECRET!
  const token = process.env.TWITTER_ACCESS_TOKEN!
  const tokenSecret = process.env.TWITTER_ACCESS_SECRET!

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
    ...extraParams,
  }

  const allParams = { ...oauthParams }
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&')

  const baseString = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(paramString)].join('&')
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64')

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature }
  const header =
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(headerParams[k])}"`)
      .join(', ')

  return header
}

export async function postTweet(content: string): Promise<string> {
  const url = 'https://api.twitter.com/2/tweets'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: oauth1Header('POST', url),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: content }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || data.title || 'Failed to post tweet')
  return data.data.id
}
