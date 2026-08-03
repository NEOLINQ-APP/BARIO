import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyOAuthState } from '@/lib/marketing/oauthState'
import { saveConnection } from '@/lib/marketing/connections'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = url.origin
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent('Google authorization was cancelled or failed')}`)
  }
  const verified = await verifyOAuthState(state, 'google_business')
  if (!verified) {
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent('That authorization link expired — try connecting again')}`)
  }

  try {
    const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET!
    const redirectUri = `${origin}/api/admin/marketing/connect/google/callback`

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Failed to exchange code for a Google token')
    if (!tokenData.refresh_token) {
      throw new Error('Google did not return a refresh token — if you\'ve connected this account before, remove Bario\'s access at myaccount.google.com/permissions first, then reconnect.')
    }

    // Find the account, then its first location — takes the first of each,
    // since Bario only needs a single Business Profile location today.
    const accountsRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const accountsData = await accountsRes.json()
    if (!accountsRes.ok) throw new Error(accountsData.error?.message || 'Failed to list Google Business accounts')
    const account = accountsData.accounts?.[0]
    if (!account) throw new Error('No Google Business Profile account found for this login.')
    const accountId = String(account.name).replace('accounts/', '')

    const locationsRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    )
    const locationsData = await locationsRes.json()
    if (!locationsRes.ok) throw new Error(locationsData.error?.message || 'Failed to list Google Business locations')
    const location = locationsData.locations?.[0]
    if (!location) throw new Error('No Business Profile location found on this account.')
    const locationId = String(location.name).replace('locations/', '')

    const sql = await db()
    await saveConnection(
      sql,
      'google_business',
      {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        metadata: { accountId, locationId, locationTitle: location.title ?? '' },
      },
      verified.adminUserId
    )

    return NextResponse.redirect(`${origin}/admin/marketing?connected=google_business`)
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent(err.message)}`)
  }
}
