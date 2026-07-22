import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type GiftCode } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { code } = await req.json()
    if (typeof code !== 'string' || !code.trim()) {
      return NextResponse.json({ error: 'Enter a code' }, { status: 400 })
    }

    const sql = await db()
    const rows = (await sql`SELECT * FROM gift_codes WHERE code = ${code.trim().toUpperCase()}`) as unknown as GiftCode[]
    const giftCode = rows[0]

    if (!giftCode || !giftCode.is_active) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 404 })
    }
    if (giftCode.expires_at && new Date(giftCode.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This code has expired' }, { status: 400 })
    }
    if (giftCode.max_redemptions !== null && giftCode.redemption_count >= giftCode.max_redemptions) {
      return NextResponse.json({ error: 'This code has already been fully redeemed' }, { status: 400 })
    }

    const existing = (await sql`
      SELECT id FROM gift_code_redemptions WHERE gift_code_id = ${giftCode.id} AND user_id = ${session.userId}
    `) as unknown as { id: string }[]
    if (existing[0]) {
      return NextResponse.json({ error: "You've already redeemed this code" }, { status: 409 })
    }

    await sql`
      INSERT INTO gift_code_redemptions (id, gift_code_id, user_id) VALUES (${randomUUID()}, ${giftCode.id}, ${session.userId})
    `
    await sql`UPDATE gift_codes SET redemption_count = redemption_count + 1 WHERE id = ${giftCode.id}`

    const rows2 = (await sql`
      UPDATE users SET credits_remaining = credits_remaining + ${giftCode.credits} WHERE id = ${session.userId}
      RETURNING credits_remaining
    `) as unknown as { credits_remaining: number }[]

    return NextResponse.json({ ok: true, creditsAdded: giftCode.credits, creditsRemaining: rows2[0]?.credits_remaining ?? 0 })
  } catch (err: any) {
    return errorResponse(err)
  }
}
