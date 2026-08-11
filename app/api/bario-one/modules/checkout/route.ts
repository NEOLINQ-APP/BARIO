import { NextResponse } from 'next/server'
import { getStripe, BO_MODULE_PRICE_IDS } from '@/lib/stripe'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getActiveOrgForUser } from '@/lib/barioOne'
import { BO_MODULE_KEYS, resolveModuleDependencies, type BoModuleKey } from '@/lib/barioOneModules'
import { errorResponse } from '@/lib/errors'

// Converts a trialing-with-no-live-subscription org into a real, multi-item
// Stripe subscription — one line item per selected module (resolved to
// include dependencies, e.g. picking `payroll` also bills `employees`).
// Mirrors /api/bario-one/checkout's shape (separate from signup so a card
// isn't required at account-creation time) but supports an arbitrary module
// set instead of one of 3 fixed plans.
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
    if (org.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'Billing is already active for this organization — use the module update endpoint to add or remove modules' },
        { status: 400 }
      )
    }

    const { moduleKeys } = await req.json()
    if (!Array.isArray(moduleKeys) || moduleKeys.length === 0 || !moduleKeys.every((k) => (BO_MODULE_KEYS as string[]).includes(k))) {
      return NextResponse.json({ error: `moduleKeys must be a non-empty array of: ${BO_MODULE_KEYS.join(', ')}` }, { status: 400 })
    }

    const resolvedKeys = resolveModuleDependencies(moduleKeys as BoModuleKey[])
    const lineItems: { price: string; quantity: number }[] = []
    for (const key of resolvedKeys) {
      const priceId = BO_MODULE_PRICE_IDS[key]
      if (!priceId) return NextResponse.json({ error: `The ${key} module isn't available for purchase right now` }, { status: 400 })
      lineItems.push({ price: priceId, quantity: 1 })
    }

    const trialDaysRemaining = org.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : 0

    const origin = req.headers.get('origin') ?? 'https://bario.ca'

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      ...(org.stripe_customer_id ? { customer: org.stripe_customer_id } : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { boOrgId: org.id, userId: user.id, moduleKeys: JSON.stringify(resolvedKeys) },
      line_items: lineItems,
      subscription_data: trialDaysRemaining > 0 ? { trial_period_days: trialDaysRemaining } : undefined,
      success_url: `${origin}/dashboard/bario-one?checkout=success`,
      cancel_url: `${origin}/dashboard/bario-one/modules`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
