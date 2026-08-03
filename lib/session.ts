import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'

const COOKIE_NAME = 'bario_session'
const ALG = 'HS256'

function getSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function createSession(userId: string, sessionVersion: number) {
  const token = await new SignJWT({ sub: userId, sv: sessionVersion })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret())

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

// Checks the token's session version against the DB so that changing/resetting
// a password immediately invalidates any other token still out there (e.g. a
// stolen cookie), without needing a server-side session store.
export async function getSession(): Promise<{ userId: string } | null> {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const userId = payload.sub as string
    const sv = payload.sv as number | undefined

    const sql = await db()
    const rows = (await sql`SELECT session_version FROM users WHERE id = ${userId}`) as unknown as { session_version: number }[]
    const currentSv = rows[0]?.session_version
    if (currentSv === undefined || sv === undefined || currentSv !== sv) return null

    return { userId }
  } catch {
    return null
  }
}

export function clearSession() {
  cookies().set(COOKIE_NAME, '', { path: '/', maxAge: 0 })
}

export function hashPersonalAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Used by app/api/media/* so the X-Drive desktop sync client can
// authenticate with a durable, revocable Authorization: Bearer token
// (lib/db.ts's personal_access_tokens) instead of the 30-day browser
// session cookie a native app has no good way to hold onto. Falls back to
// the normal cookie session so browser calls to the same routes are
// unaffected.
export async function getApiSession(req: Request): Promise<{ userId: string } | null> {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim()
    if (!token) return null
    const tokenHash = hashPersonalAccessToken(token)

    const sql = await db()
    const rows = (await sql`
      SELECT user_id FROM personal_access_tokens WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
    `) as unknown as { user_id: string }[]
    const row = rows[0]
    if (!row) return null

    await sql`UPDATE personal_access_tokens SET last_used_at = now() WHERE token_hash = ${tokenHash}`
    return { userId: row.user_id }
  }

  return getSession()
}
