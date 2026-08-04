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
    return NextResponse.redirect(`${origin}${RETURN_PATH}?error=${encodeURIComponent('LinkedIn authorization was cancelled or failed')}`)
  }
  const verified = await verifySocialOAuthState(state, 'linkedin')
  if (!verified) {
    return NextResponse.redirect(`${origin}${RETURN_PATH}?error=${encodeURIComponent('That authorization link expired — try connecting again')}`)
  }

  try {
    const clientId = process.env.LINKEDIN_CLIENT_ID!
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!
    const redirectUri = `${origin}/api/social/connect/linkedin/callback`

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Failed to exchange code for a LinkedIn token')

    const aclRes = await fetch('https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'LinkedIn-Version': '202405',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    })
    const aclData = await aclRes.json()
    if (!aclRes.ok) throw new Error(aclData.message || 'Failed to list LinkedIn organizations this account administers')
    const orgUrn: string | undefined = aclData.elements?.[0]?.organization
    if (!orgUrn) throw new Error('No LinkedIn Company Page found for this account — make sure you administer one, then reconnect.')

    const sql = await db()
    await saveSocialConnection(sql, verified.userId, 'linkedin', {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
      metadata: { orgUrn },
    })

    return NextResponse.redirect(`${origin}${RETURN_PATH}?connected=linkedin`)
  } catch (err: any) {
    return NextResponse.redirect(`${origin}${RETURN_PATH}?error=${encodeURIComponent(err.message)}`)
  }
}
