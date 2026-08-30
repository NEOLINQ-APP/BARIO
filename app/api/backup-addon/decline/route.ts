import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/errors'
import { BACKUP_ADDON_DISCLAIMER } from '../accept/route'

// Declining is a real, provable choice, not just a UI dismissal -- records
// the exact disclaimer text shown alongside the timestamp, so a later
// dispute ("I never agreed to that") has a real answer.
export async function POST() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    await sql`UPDATE users SET backup_addon_status = 'declined' WHERE id = ${session.userId}`
    await sql`
      INSERT INTO backup_addon_decisions (id, user_id, choice, price_cents, disclaimer_text_shown)
      VALUES (${randomUUID()}, ${session.userId}, 'declined', NULL, ${BACKUP_ADDON_DISCLAIMER})
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
