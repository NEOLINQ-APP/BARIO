import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { signOAuthState } from '@/lib/marketing/oauthState'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  if (!auth.user) return NextResponse.json({ error: 'Sign in as an admin to connect a platform' }, { status: 403 })

  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'GOOGLE_BUSINESS_CLIENT_ID is not configured yet' }, { status: 400 })

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/admin/marketing/connect/google/callback`
  const state = await signOAuthState('google_business', auth.user.id)

  const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/business.manage')
  // offline + consent is what actually gets a refresh_token back — without
  // both, Google only returns one the very first time an account ever
  // authorizes this app, which isn't reliable enough to depend on.
  authorizeUrl.searchParams.set('access_type', 'offline')
  authorizeUrl.searchParams.set('prompt', 'consent')
  authorizeUrl.searchParams.set('state', state)

  return NextResponse.redirect(authorizeUrl.toString())
}
