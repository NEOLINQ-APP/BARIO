// Google Ads-specific OAuth2 (authorization code flow) — deliberately a
// separate Google Cloud OAuth client from lib/googleOAuth.ts's sign-in
// flow (GOOGLE_ADS_CLIENT_ID/SECRET, not GOOGLE_OAUTH_CLIENT_ID/SECRET),
// since this needs the sensitive `adwords` scope and offline (refresh
// token) access, which a plain sign-in flow has no business requesting.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADWORDS_SCOPE = 'https://www.googleapis.com/auth/adwords'

function getCredentials() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET is not set')
  }
  return { clientId, clientSecret }
}

export function getAdsRedirectUri(origin: string) {
  return `${origin}/api/bario-one/marketing/google-ads/oauth/callback`
}

export function buildGoogleAdsAuthUrl(origin: string, state: string) {
  const { clientId } = getCredentials()
  const url = new URL(AUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', getAdsRedirectUri(origin))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', ADWORDS_SCOPE)
  url.searchParams.set('state', state)
  // access_type=offline + prompt=consent is what actually gets a refresh
  // token back -- without both, Google only returns a short-lived access
  // token, which is useless for a server that needs to call the Ads API
  // on an ongoing basis without the user re-authorizing every hour.
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  return url.toString()
}

export async function exchangeAdsCodeForTokens(code: string, origin: string) {
  const { clientId, clientSecret } = getCredentials()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getAdsRedirectUri(origin),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Ads token exchange failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
}
