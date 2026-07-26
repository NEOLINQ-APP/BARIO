import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { STORAGE_TIERS, isStorageTierKey } from '@/lib/storageTiers'
import { getStripe } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email first' }, { status: 403 })
    }

    const { tier } = await req.json()
    if (!isStorageTierKey(tier) || tier === 'free') {
      return NextResponse.json({ error: 'Invalid storage tier' }, { status: 400 })
    }

    const origin = req.headers.get('origin') ?? 'https://bario.ca'
    const tierInfo = STORAGE_TIERS[tier]

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      // Reuse the existing Stripe customer if this account already has one
      // (e.g. from a site-plan subscription) rather than letting Stripe spin
      // up a second Customer object for the same person.
      ...(user.stripe_customer_id ? { customer: user.stripe_customer_id } : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { userId: user.id, storageTier: tier },
      line_items: [{
        price_data: {
          currency: 'cad',
          unit_amount: tierInfo.priceCentsCad,
          recurring: { interval: 'month' },
          product_data: { name: `Bario Storage — ${tierInfo.label} (${tierInfo.bytes / 1024 ** 3}GB)` },
        },
        quantity: 1,
      }],
      success_url: `${origin}/media?storage=success`,
      cancel_url: `${origin}/media`,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
