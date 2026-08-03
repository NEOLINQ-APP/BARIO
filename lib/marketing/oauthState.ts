import { SignJWT, jwtVerify } from 'jose'
import type { MarketingPlatform } from '@/lib/db'

// Signed, short-lived state param for the OAuth connect flows — same JWT
// approach as lib/session.ts, reusing SESSION_SECRET rather than adding a
// second secret to manage. Doubles as CSRF protection (the callback only
// trusts a state it can verify) and, for Twitter's OAuth 1.0a dance, as a
// stateless place to carry the request-token secret between steps instead
// of a DB table that would need its own cleanup.
const ALG = 'HS256'

function getSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function signOAuthState(platform: MarketingPlatform, adminUserId: string, extra?: Record<string, string>): Promise<string> {
  return new SignJWT({ platform, adminUserId, ...extra })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(getSecret())
}

export async function verifyOAuthState(
  token: string,
  expectedPlatform: MarketingPlatform
): Promise<{ adminUserId: string; extra: Record<string, string> } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (payload.platform !== expectedPlatform) return null
    const { platform: _p, adminUserId, iat: _iat, exp: _exp, ...extra } = payload as Record<string, unknown>
    if (typeof adminUserId !== 'string') return null
    return { adminUserId, extra: extra as Record<string, string> }
  } catch {
    return null
  }
}
