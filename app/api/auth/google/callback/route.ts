import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomUUID, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { createSession } from '@/lib/session'
import { exchangeCodeForTokens, getGoogleUserInfo } from '@/lib/googleOAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { seedDefaultXDriveFolders } from '@/lib/xdriveFolders'

function redirectToLogin(origin: string, error: string) {
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`)
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !state) return redirectToLogin(origin, 'Google sign-in was cancelled')

  const [nonce, encodedPayload] = state.split('.')
  const cookieNonce = req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('google_oauth_nonce='))
    ?.split('=')[1]

  if (!nonce || nonce !== cookieNonce) return redirectToLogin(origin, 'Sign-in session expired — try again')

  let payload: { plan: string | null; promo: string | null; next: string | null }
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    payload = { plan: null, promo: null, next: null }
  }

  try {
    const sql = await db()

    const ipOk = await rateLimit(sql, `google-auth:ip:${clientIp(req)}`, 20, 60 * 60)
    if (!ipOk) return redirectToLogin(origin, 'Too many attempts — try again later')

    const tokens = await exchangeCodeForTokens(code, origin)
    const profile = await getGoogleUserInfo(tokens.access_token)

    if (!profile.email || !profile.email_verified) {
      return redirectToLogin(origin, 'Your Google account has no verified email')
    }
    const normalizedEmail = profile.email.trim().toLowerCase()

    const existing = (await sql`SELECT id, session_version FROM users WHERE email = ${normalizedEmail}`) as unknown as {
      id: string
      session_version: number
    }[]

    let userId: string
    let sessionVersion: number

    if (existing.length > 0) {
      userId = existing[0].id
      sessionVersion = existing[0].session_version
    } else {
      // No password is ever set for a Google-only account — a random,
      // never-shared bcrypt hash keeps the NOT NULL constraint satisfied
      // without adding a nullable-password code path everywhere else that
      // already assumes one. The user can still set a real password later
      // via the normal forgot-password flow.
      const placeholderHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10)
      userId = randomUUID()
      sessionVersion = 0
      await sql`
        INSERT INTO users (id, email, password_hash, email_verified)
        VALUES (${userId}, ${normalizedEmail}, ${placeholderHash}, true)
      `
      try {
        await seedDefaultXDriveFolders(sql, userId)
      } catch (err) {
        console.error('Failed to seed default X-Drive folders', err)
      }
    }

    await createSession(userId, sessionVersion)

    const continueUrl = new URL('/auth/continue', origin)
    if (payload.plan) continueUrl.searchParams.set('plan', payload.plan)
    if (payload.promo) continueUrl.searchParams.set('promo', payload.promo)
    if (payload.next) continueUrl.searchParams.set('next', payload.next)

    const res = NextResponse.redirect(continueUrl)
    res.cookies.set('google_oauth_nonce', '', { path: '/', maxAge: 0 })
    return res
  } catch (err) {
    console.error('Google OAuth callback failed', err)
    return redirectToLogin(origin, 'Google sign-in failed — try again')
  }
}
