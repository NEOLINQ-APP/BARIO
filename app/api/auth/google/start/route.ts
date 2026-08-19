import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { buildGoogleAuthUrl } from '@/lib/googleOAuth'

// Kicks off the OAuth flow. plan/promo/next are carried through Google's
// round trip inside `state` (base64 JSON, prefixed with a CSRF nonce we
// verify against a short-lived cookie on callback) since Google's
// redirect_uri must match exactly and can't itself carry per-request data.
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  try {
    const nonce = randomBytes(16).toString('hex')
    const payload = {
      plan: searchParams.get('plan'),
      promo: searchParams.get('promo'),
      next: searchParams.get('next'),
    }
    const state = `${nonce}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`

    const res = NextResponse.redirect(buildGoogleAuthUrl(origin, state))
    res.cookies.set('google_oauth_nonce', nonce, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    })
    return res
  } catch (err) {
    console.error('Google OAuth start failed', err)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Google sign-in is not available right now')}`)
  }
}
