// Direct Google OAuth2 (authorization code flow) — no Supabase or other
// broker in the middle. BARIO's own session system (lib/session.ts) issues
// the cookie once we've verified the Google identity.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

function getCredentials() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET is not set')
  }
  return { clientId, clientSecret }
}

export function getRedirectUri(origin: string) {
  return `${origin}/api/auth/google/callback`
}

export function buildGoogleAuthUrl(origin: string, state: string) {
  const { clientId } = getCredentials()
  const url = new URL(AUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', getRedirectUri(origin))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

export async function exchangeCodeForTokens(code: string, origin: string) {
  const { clientId, clientSecret } = getCredentials()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(origin),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google token exchange failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<{ access_token: string; id_token: string }>
}

export async function getGoogleUserInfo(accessToken: string) {
  const res = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google userinfo fetch failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<{ email: string; email_verified: boolean; name?: string; picture?: string }>
}
