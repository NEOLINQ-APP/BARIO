import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { exchangeAdsCodeForTokens } from '@/lib/googleAdsOAuth'
import { encryptPassword } from '@/lib/vpsPassword'

function redirectToAdsPage(origin: string, error?: string) {
  const url = `${origin}/dashboard/bario-one/marketing/google-ads`
  return NextResponse.redirect(error ? `${url}?error=${encodeURIComponent(error)}` : `${url}?connected=1`)
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const nonce = searchParams.get('state')

  const auth = await requireBoModule('crm')
  if (auth instanceof NextResponse) return auth
  const { sql, user, org } = auth

  if (!code || !nonce) return redirectToAdsPage(origin, 'Google Ads connection was cancelled')

  const cookieNonce = req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('google_ads_oauth_nonce='))
    ?.split('=')[1]
  if (!nonce || nonce !== cookieNonce) return redirectToAdsPage(origin, 'Connection session expired — try again')

  try {
    const tokens = await exchangeAdsCodeForTokens(code, origin)
    if (!tokens.refresh_token) {
      // Happens if the user already granted consent before and Google
      // skips issuing a new refresh token -- prompt=consent on the start
      // route is meant to prevent this, but a stale prior grant can still
      // do it. Telling the user to revoke access at myaccount.google.com
      // and retry is the real fix, not something we can force silently.
      return redirectToAdsPage(origin, 'Google did not return a refresh token — revoke prior access at myaccount.google.com/permissions and try connecting again')
    }

    const { ciphertext, iv } = encryptPassword(tokens.refresh_token)
    await sql`
      INSERT INTO bo_google_ads_connections (organization_id, refresh_token_ciphertext, refresh_token_iv, connected_by_user_id)
      VALUES (${org.id}, ${ciphertext}, ${iv}, ${user.id})
      ON CONFLICT (organization_id) DO UPDATE SET
        refresh_token_ciphertext = ${ciphertext}, refresh_token_iv = ${iv},
        connected_by_user_id = ${user.id}, connected_at = now()
    `
    return redirectToAdsPage(origin)
  } catch (err) {
    console.error('Google Ads OAuth callback failed', err)
    return redirectToAdsPage(origin, 'Could not complete the Google Ads connection')
  }
}
