import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// All values here are already-encrypted/opaque by the time they reach this
// route — see lib/e2eCrypto.ts. This route never sees a passphrase, a
// recovery code, or a plaintext key; it just stores and returns blobs the
// client generated and will unwrap itself.

async function loadUser(sql: any, userId: string): Promise<User | null> {
  const rows = (await sql`SELECT * FROM users WHERE id = ${userId}`) as unknown as User[]
  return rows[0] ?? null
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const user = await loadUser(sql, session.userId)
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      enabled: user.e2e_enabled,
      salt: user.e2e_salt,
      wrappedMek: user.e2e_wrapped_mek,
      wrappedMekIv: user.e2e_wrapped_mek_iv,
      recoverySalt: user.e2e_recovery_salt,
      recoveryWrappedMek: user.e2e_recovery_wrapped_mek,
      recoveryWrappedMekIv: user.e2e_recovery_wrapped_mek_iv,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Used both for initial setup (enabling E2E for the first time) and for a
// "change passphrase" flow (client unwraps the MEK via the old passphrase or
// recovery code, then re-wraps it under a new passphrase and posts here —
// the MEK itself never changes, only how it's wrapped, so already-encrypted
// files stay readable).
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const user = await loadUser(sql, session.userId)
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { salt, wrappedMek, wrappedMekIv, recoverySalt, recoveryWrappedMek, recoveryWrappedMekIv } = await req.json()
    for (const [name, value] of Object.entries({ salt, wrappedMek, wrappedMekIv, recoverySalt, recoveryWrappedMek, recoveryWrappedMekIv })) {
      if (typeof value !== 'string' || !value) {
        return NextResponse.json({ error: `${name} is required` }, { status: 400 })
      }
    }

    await sql`
      UPDATE users SET
        e2e_enabled = true,
        e2e_salt = ${salt},
        e2e_wrapped_mek = ${wrappedMek},
        e2e_wrapped_mek_iv = ${wrappedMekIv},
        e2e_recovery_salt = ${recoverySalt},
        e2e_recovery_wrapped_mek = ${recoveryWrappedMek},
        e2e_recovery_wrapped_mek_iv = ${recoveryWrappedMekIv}
      WHERE id = ${user.id}
    `

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
