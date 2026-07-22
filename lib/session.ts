import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
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
