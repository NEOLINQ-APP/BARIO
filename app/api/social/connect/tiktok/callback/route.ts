import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySocialOAuthState } from '@/lib/social/oauthState'
import { saveSocialConnection } from '@/lib/social/connections'

const RETURN_PATH = '/dashboard/social'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = url.origin
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.redirect(`${origin}${RETURN_PATH}?error=${encodeURIComponent('TikTok authorization was cancelled or failed')}`)
  }
  const verified = await verifySocialOAuthState(state, 'tiktok')
  if (!verified || !verified.extra.codeVerifier) {
    return NextResponse.redirect(`${origin}${RETURN_PATH}?error=${encodeURIComponent('That authorization link expired — try connecting again')}`)
  }

  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY!
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET!
    const redirectUri = `${origin}/api/social/connect/tiktok/callback`

    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: verified.extra.codeVerifier,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || tokenData.error) throw new Error(tokenData.error_description || 'Failed to exchange code for a TikTok token')

    const sql = await db()
    await saveSocialConnection(sql, verified.userId, 'tiktok', {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
      metadata: { openId: tokenData.open_id ?? '' },
    })

    return NextResponse.redirect(`${origin}${RETURN_PATH}?connected=tiktok`)
  } catch (err: any) {
    return NextResponse.redirect(`${origin}${RETURN_PATH}?error=${encodeURIComponent(err.message)}`)
  }
}
