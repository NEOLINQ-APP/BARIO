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
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent('LinkedIn authorization was cancelled or failed')}`)
  }
  const verified = await verifyOAuthState(state, 'linkedin')
  if (!verified) {
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent('That authorization link expired — try connecting again')}`)
  }

  try {
    const clientId = process.env.LINKEDIN_CLIENT_ID!
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!
    const redirectUri = `${origin}/api/admin/marketing/connect/linkedin/callback`

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

    // Find the organization(s) this member administers — takes the first
    // one, since Bario only needs a single Company Page today.
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
    await saveConnection(
      sql,
      'linkedin',
      {
        accessToken: tokenData.access_token,
        expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        metadata: { orgUrn },
      },
      verified.adminUserId
    )

    return NextResponse.redirect(`${origin}/admin/marketing?connected=linkedin`)
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent(err.message)}`)
  }
}
