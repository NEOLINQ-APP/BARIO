import { NextResponse } from 'next/server'
import { randomUUID, randomBytes } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

async function requireAdmin(sql: any, userId: string): Promise<User | null> {
  const rows = (await sql`SELECT * FROM users WHERE id = ${userId}`) as unknown as User[]
  const user = rows[0]
  return user?.is_admin ? user : null
}

function generateCode() {
  return randomBytes(5).toString('hex').toUpperCase()
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const admin = await requireAdmin(sql, session.userId)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const codes = (await sql`SELECT * FROM gift_codes ORDER BY created_at DESC`) as unknown as any[]
  return NextResponse.json({ codes })
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const admin = await requireAdmin(sql, session.userId)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { code, credits, note, maxRedemptions, expiresInDays } = await req.json()

    const creditsNum = Number(credits)
    if (!Number.isFinite(creditsNum) || creditsNum <= 0) {
      return NextResponse.json({ error: 'Credits must be a positive number' }, { status: 400 })
    }

    const finalCode = (typeof code === 'string' && code.trim() ? code.trim() : generateCode()).toUpperCase()
    const maxR = maxRedemptions ? Number(maxRedemptions) : null
    const expiresAt = expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString() : null

    await sql`
      INSERT INTO gift_codes (id, code, credits, note, max_redemptions, expires_at, created_by)
      VALUES (${randomUUID()}, ${finalCode}, ${creditsNum}, ${note ?? ''}, ${maxR}, ${expiresAt}, ${admin.id})
    `

    return NextResponse.json({ ok: true, code: finalCode })
  } catch (err: any) {
    if (err.message?.includes('duplicate') || err.code === '23505') {
      return NextResponse.json({ error: 'That code already exists — try a different one' }, { status: 409 })
    }
    return errorResponse(err)
  }
}
