import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { signOAuthState } from '@/lib/marketing/oauthState'

// Instagram rides the same Meta connection, so this one flow covers both —
// see the comment on MarketingConnection in lib/db.ts.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  if (!auth.user) return NextResponse.json({ error: 'Sign in as an admin to connect a platform' }, { status: 403 })

  const appId = process.env.META_APP_ID
  if (!appId) return NextResponse.json({ error: 'META_APP_ID is not configured yet' }, { status: 400 })

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/admin/marketing/connect/facebook/callback`
  const state = await signOAuthState('facebook', auth.user.id)

  const authorizeUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth')
  authorizeUrl.searchParams.set('client_id', appId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set(
    'scope',
    'pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic,instagram_content_publish,business_management'
  )

  return NextResponse.redirect(authorizeUrl.toString())
}
