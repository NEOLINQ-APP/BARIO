import { NextResponse } from 'next/server'
import { getStripe, BACKUP_ADDON_PRICE_ID } from '@/lib/stripe'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// The exact copy shown to every user at decision time -- kept here, not
// just in the frontend, so what actually gets stored in
// backup_addon_decisions.disclaimer_text_shown is guaranteed to match what
// was really on screen, not whatever the client happened to POST.
export const BACKUP_ADDON_DISCLAIMER =
  "Backup Protection ($9/mo): We'll keep automatic backups of your site and data, so you can recover it if something goes wrong. If you decline, Bario keeps no backup of your account — if your data is lost, deleted, or corrupted for any reason, Bario is not liable and cannot recover it for you."

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!BACKUP_ADDON_PRICE_ID) return NextResponse.json({ error: 'Backup add-on is not configured yet' }, { status: 503 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })

    const origin = req.headers.get('origin') ?? 'https://bario.ca'
    const stripe = getStripe()
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { userId: user.id, purpose: 'backup_addon', disclaimerText: BACKUP_ADDON_DISCLAIMER },
      line_items: [{ price: BACKUP_ADDON_PRICE_ID, quantity: 1 }],
      success_url: `${origin}/dashboard?backup=accepted`,
      cancel_url: `${origin}/onboarding/backup`,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    return errorResponse(err)
  }
}
