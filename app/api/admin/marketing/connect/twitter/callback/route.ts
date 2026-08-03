import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { verifyOAuthState } from '@/lib/marketing/oauthState'
import { oauth1Header } from '@/lib/marketing/twitter'
import { saveConnection } from '@/lib/marketing/connections'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = url.origin
  const oauthToken = url.searchParams.get('oauth_token')
  const oauthVerifier = url.searchParams.get('oauth_verifier')

  const stateCookie = cookies().get('bario_twitter_oauth_state')?.value
  cookies().delete('bario_twitter_oauth_state')

  if (!oauthToken || !oauthVerifier || !stateCookie) {
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent('X authorization was cancelled or failed')}`)
  }
  const verified = await verifyOAuthState(stateCookie, 'twitter')
  if (!verified) {
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent('That authorization link expired — try connecting again')}`)
  }
  const requestTokenSecret = verified.extra.requestTokenSecret
  if (!requestTokenSecret) {
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent('Missing request token secret — try connecting again')}`)
  }

  try {
    const accessUrl = 'https://api.twitter.com/oauth/access_token'
    const res = await fetch(accessUrl, {
      method: 'POST',
      headers: {
        Authorization: oauth1Header('POST', accessUrl, oauthToken, requestTokenSecret, { oauth_verifier: oauthVerifier }),
      },
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`Failed to complete X authorization: ${text}`)

    const params = new URLSearchParams(text)
    const accessToken = params.get('oauth_token')
    const accessTokenSecret = params.get('oauth_token_secret')
    const screenName = params.get('screen_name')
    if (!accessToken || !accessTokenSecret) throw new Error('X did not return a permanent access token')

    const sql = await db()
    await saveConnection(
      sql,
      'twitter',
      { accessToken, accessTokenSecret, metadata: screenName ? { screenName } : {} },
      verified.adminUserId
    )

    return NextResponse.redirect(`${origin}/admin/marketing?connected=twitter`)
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent(err.message)}`)
  }
}
