import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { signSocialOAuthState } from '@/lib/social/oauthState'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to connect a platform' }, { status: 401 })

  const clientId = process.env.LINKEDIN_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'LINKEDIN_CLIENT_ID is not configured yet' }, { status: 400 })

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/social/connect/linkedin/callback`
  const state = await signSocialOAuthState('linkedin', session.userId)

  const authorizeUrl = new URL('https://www.linkedin.com/oauth/v2/authorization')
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('state', state)
  // offline_access gets us a refresh_token (lib/social/linkedin.ts) so the
  // customer doesn't have to manually reconnect every ~60 days. Requires
  // LinkedIn's "Community Management API" product on the developer app.
  authorizeUrl.searchParams.set('scope', 'w_organization_social r_organization_admin rw_organization_admin offline_access')

  return NextResponse.redirect(authorizeUrl.toString())
}
