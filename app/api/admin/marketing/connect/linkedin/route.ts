import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { signOAuthState } from '@/lib/marketing/oauthState'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  if (!auth.user) return NextResponse.json({ error: 'Sign in as an admin to connect a platform' }, { status: 403 })

  const clientId = process.env.LINKEDIN_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'LINKEDIN_CLIENT_ID is not configured yet' }, { status: 400 })

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/admin/marketing/connect/linkedin/callback`
  const state = await signOAuthState('linkedin', auth.user.id)

  const authorizeUrl = new URL('https://www.linkedin.com/oauth/v2/authorization')
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('state', state)
  // Requires LinkedIn's "Community Management API" product to be added to
  // the developer app before these scopes are grantable.
  authorizeUrl.searchParams.set('scope', 'w_organization_social r_organization_admin rw_organization_admin')

  return NextResponse.redirect(authorizeUrl.toString())
}
