import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { buildGoogleAdsAuthUrl } from '@/lib/googleAdsOAuth'

export async function GET(req: Request) {
  const auth = await requireBoModule('crm')
  if (auth instanceof NextResponse) return auth

  const { origin } = new URL(req.url)
  try {
    const nonce = randomBytes(16).toString('hex')
    const res = NextResponse.redirect(buildGoogleAdsAuthUrl(origin, nonce))
    res.cookies.set('google_ads_oauth_nonce', nonce, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    })
    return res
  } catch (err) {
    console.error('Google Ads OAuth start failed', err)
    return NextResponse.redirect(`${origin}/dashboard/bario-one/marketing/google-ads?error=${encodeURIComponent('Could not start Google Ads connection')}`)
  }
}
