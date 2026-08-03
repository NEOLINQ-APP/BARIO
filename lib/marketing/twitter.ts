import { createHmac, randomBytes } from 'node:crypto'
import { getConnection } from '@/lib/marketing/connections'
import type { db as dbFn } from '@/lib/db'

type Sql = Awaited<ReturnType<typeof dbFn>>

// X API v2 tweet creation requires user-context auth — OAuth 1.0a with a
// permanent access token/secret is the simplest fit for a single business
// account (no refresh flow needed, unlike OAuth 2.0 user tokens). The
// consumer key/secret identify Bario's own developer app (env vars); the
// token/tokenSecret are the connected account's, from the DB.
export function oauth1Header(
  method: string,
  url: string,
  token: string | null,
  tokenSecret: string | null,
  extraParams: Record<string, string> = {}
) {
  const consumerKey = process.env.TWITTER_API_KEY!
  const consumerSecret = process.env.TWITTER_API_SECRET!

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
    ...(token ? { oauth_token: token } : {}),
    ...extraParams,
  }

  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
    .join('&')

  const baseString = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(paramString)].join('&')
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret ?? '')}`
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64')

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature }
  return (
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(headerParams[k])}"`)
      .join(', ')
  )
}

export async function postTweet(sql: Sql, content: string): Promise<string> {
  const conn = await getConnection(sql, 'twitter')
  if (!conn) throw new Error('X (Twitter) is not connected')

  const url = 'https://api.twitter.com/2/tweets'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: oauth1Header('POST', url, conn.access_token, conn.access_token_secret),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: content }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || data.title || 'Failed to post tweet')
  return data.data.id
}
