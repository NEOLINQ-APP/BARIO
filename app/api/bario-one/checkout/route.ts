import { NextResponse } from 'next/server'
import { getStripe, BO_PLAN_PRICE_IDS } from '@/lib/stripe'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getActiveOrgForUser } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// Converts a trialing-with-no-live-subscription org (created by
// /api/bario-one/signup) into a real Stripe subscription. Deliberately
// separate from signup so a card isn't required at account-creation time —
// same "preview/commit split" pattern Product C's static-conversion flow
// uses, just for billing instead of a static-site preview.
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })

    const found = await getActiveOrgForUser(sql, user.id)
    if (!found) return NextResponse.json({ error: 'No Bario One organization found' }, { status: 404 })
    const { org, membership } = found
    if (membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the account owner can manage billing' }, { status: 403 })
    }
    if (org.plan === 'enterprise') {
      return NextResponse.json({ error: 'Enterprise is contact-sales only — reach out to your account rep' }, { status: 400 })
    }
    if (org.stripe_subscription_id) {
      return NextResponse.json({ error: 'Billing is already active for this organization' }, { status: 400 })
    }

    const priceId = BO_PLAN_PRICE_IDS[org.plan as 'starter' | 'professional' | 'business']
    if (!priceId) {
      return NextResponse.json({ error: 'This plan is not available for purchase right now' }, { status: 400 })
    }

    const trialDaysRemaining = org.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : 0

    const origin = req.headers.get('origin') ?? 'https://bario.ca'

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      ...(org.stripe_customer_id ? { customer: org.stripe_customer_id } : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { boOrgId: org.id, userId: user.id },
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: trialDaysRemaining > 0 ? { trial_period_days: trialDaysRemaining } : undefined,
      success_url: `${origin}/dashboard/bario-one?checkout=success`,
      cancel_url: `${origin}/dashboard/bario-one/billing`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
