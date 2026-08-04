import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { signSocialOAuthState } from '@/lib/social/oauthState'

// Instagram rides the same Meta connection, so this one flow covers both —
// see the comment on storageKey in lib/social/connections.ts.
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to connect a platform' }, { status: 401 })

  const appId = process.env.META_APP_ID
  if (!appId) return NextResponse.json({ error: 'META_APP_ID is not configured yet' }, { status: 400 })

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/social/connect/facebook/callback`
  const state = await signSocialOAuthState('facebook', session.userId)

  const authorizeUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth')
  authorizeUrl.searchParams.set('client_id', appId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('state', state)
  // leads_retrieval + ads_management are needed to read a Lead Ad's full
  // field_data server-side (the webhook only ever sends the leadgen_id) and
  // to eventually enable paid campaigns — both require Meta App Review
  // (Advanced Access) before they work outside this app's own test users.
  authorizeUrl.searchParams.set(
    'scope',
    'pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic,instagram_content_publish,business_management,leads_retrieval'
  )

  return NextResponse.redirect(authorizeUrl.toString())
}
