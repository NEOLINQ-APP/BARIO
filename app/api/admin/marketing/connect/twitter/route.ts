import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAdmin } from '@/lib/admin'
import { oauth1Header } from '@/lib/marketing/twitter'
import { signOAuthState } from '@/lib/marketing/oauthState'

// X still uses OAuth 1.0a's 3-legged dance for user-context posting (see
// lib/marketing/twitter.ts). Unlike OAuth 2.0's `state` param, there's no
// guarantee X echoes back arbitrary extra data through this flow, so the
// request-token secret (needed to sign the final access-token exchange) is
// stashed in a short-lived, HttpOnly cookie instead — set here, read back
// in the callback, which works because this is a normal browser redirect
// out to X and back, not a cross-origin fetch.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  if (!auth.user) return NextResponse.json({ error: 'Sign in as an admin to connect a platform' }, { status: 403 })

  if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_SECRET) {
    return NextResponse.json({ error: 'TWITTER_API_KEY/TWITTER_API_SECRET are not configured yet' }, { status: 400 })
  }

  const origin = new URL(req.url).origin
  const callbackUrl = `${origin}/api/admin/marketing/connect/twitter/callback`

  const requestUrl = 'https://api.twitter.com/oauth/request_token'
  const res = await fetch(requestUrl, {
    method: 'POST',
    headers: { Authorization: oauth1Header('POST', requestUrl, null, null, { oauth_callback: callbackUrl }) },
  })
  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json({ error: `Failed to start X authorization: ${text}` }, { status: 502 })
  }
  const params = new URLSearchParams(text)
  const requestToken = params.get('oauth_token')
  const requestTokenSecret = params.get('oauth_token_secret')
  if (!requestToken || !requestTokenSecret) {
    return NextResponse.json({ error: 'X did not return a request token' }, { status: 502 })
  }

  const state = await signOAuthState('twitter', auth.user.id, { requestTokenSecret })
  cookies().set('bario_twitter_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/admin/marketing/connect/twitter',
    maxAge: 60 * 10,
  })

  const authorizeUrl = new URL('https://api.twitter.com/oauth/authorize')
  authorizeUrl.searchParams.set('oauth_token', requestToken)
  return NextResponse.redirect(authorizeUrl.toString())
}
