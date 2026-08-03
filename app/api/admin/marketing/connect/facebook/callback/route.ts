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
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent('Facebook authorization was cancelled or failed')}`)
  }
  const verified = await verifyOAuthState(state, 'facebook')
  if (!verified) {
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent('That authorization link expired — try connecting again')}`)
  }

  try {
    const appId = process.env.META_APP_ID!
    const appSecret = process.env.META_APP_SECRET!
    const redirectUri = `${origin}/api/admin/marketing/connect/facebook/callback`

    // Step 1: exchange the code for a short-lived user access token.
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
    )
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) throw new Error(tokenData.error?.message || 'Failed to exchange code for a token')

    // Step 2: exchange for a long-lived user token (~60 days) — Page tokens
    // derived from a long-lived user token are themselves long-lived.
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
    )
    const longData = await longRes.json()
    if (!longRes.ok) throw new Error(longData.error?.message || 'Failed to get a long-lived token')

    // Step 3: find the Page(s) this user manages. Takes the first one —
    // Bario only needs a single Page today.
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${longData.access_token}`)
    const pagesData = await pagesRes.json()
    if (!pagesRes.ok) throw new Error(pagesData.error?.message || 'Failed to list Facebook Pages')
    const page = pagesData.data?.[0]
    if (!page) throw new Error('No Facebook Page found on this account — create one first, then reconnect.')

    // Step 4: check for a linked Instagram Business Account on that Page.
    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
    )
    const igData = await igRes.json().catch(() => ({}))
    const igUserId: string | null = igData.instagram_business_account?.id ?? null

    const sql = await db()
    await saveConnection(
      sql,
      'facebook',
      {
        accessToken: page.access_token,
        metadata: { pageId: page.id, pageName: page.name, ...(igUserId ? { igUserId } : {}) },
      },
      verified.adminUserId
    )

    return NextResponse.redirect(`${origin}/admin/marketing?connected=facebook`)
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/admin/marketing?error=${encodeURIComponent(err.message)}`)
  }
}
