import { SignJWT, jwtVerify } from 'jose'
import type { SocialPlatform } from '@/lib/db'

// Signed, short-lived state param for the customer-facing social connect
// flows — same JWT-over-SESSION_SECRET approach as lib/marketing/oauthState.ts
// and lib/session.ts, kept as its own file (rather than generalizing the
// admin one) so a regular customer's userId is never confused with an
// adminUserId at a call site. Doubles as CSRF protection and, for TikTok's
// PKCE flow, as a stateless place to carry the code_verifier between steps.
const ALG = 'HS256'

function getSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function signSocialOAuthState(platform: SocialPlatform, userId: string, extra?: Record<string, string>): Promise<string> {
  return new SignJWT({ platform, userId, ...extra })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(getSecret())
}

export async function verifySocialOAuthState(
  token: string,
  expectedPlatform: SocialPlatform
): Promise<{ userId: string; extra: Record<string, string> } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (payload.platform !== expectedPlatform) return null
    const { platform: _p, userId, iat: _iat, exp: _exp, ...extra } = payload as Record<string, unknown>
    if (typeof userId !== 'string') return null
    return { userId, extra: extra as Record<string, string> }
  } catch {
    return null
  }
}
