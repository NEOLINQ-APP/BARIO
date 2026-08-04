import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { signSocialOAuthState } from '@/lib/social/oauthState'

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to connect a platform' }, { status: 401 })

  const clientKey = process.env.TIKTOK_CLIENT_KEY
  if (!clientKey) return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY is not configured yet' }, { status: 400 })

  // TikTok requires PKCE (S256) — the verifier travels in the signed state
  // JWT rather than a server-side session table, same "stateless carry"
  // trick lib/marketing/oauthState.ts uses for Twitter's OAuth 1.0a secret.
  const codeVerifier = base64url(randomBytes(32))
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/social/connect/tiktok/callback`
  const state = await signSocialOAuthState('tiktok', session.userId, { codeVerifier })

  const authorizeUrl = new URL('https://www.tiktok.com/v2/auth/authorize/')
  authorizeUrl.searchParams.set('client_key', clientKey)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', 'user.info.basic,video.publish')
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  return NextResponse.redirect(authorizeUrl.toString())
}
