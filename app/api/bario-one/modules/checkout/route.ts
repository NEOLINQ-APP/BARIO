import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getActiveOrgForUser, CARD_ON_FILE_TRIAL_DAYS } from '@/lib/barioOne'
import { BO_MODULE_KEYS, resolveModuleDependencies, type BoModuleKey } from '@/lib/barioOneModules'
import { buildModuleLineItems } from '@/lib/barioOneModuleLineItems'
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
    if (user.comp_protected_until && new Date(user.comp_protected_until).getTime() > Date.now()) {
      return NextResponse.json(
        { error: `This account has a billing hold on file until ${new Date(user.comp_protected_until).toLocaleDateString()} — contact Bario directly to add real billing before then.` },
        { status: 403 }
      )
    }

    const { moduleKeys } = await req.json()
    if (!Array.isArray(moduleKeys) || moduleKeys.length === 0 || !moduleKeys.every((k) => (BO_MODULE_KEYS as string[]).includes(k))) {
      return NextResponse.json({ error: `moduleKeys must be a non-empty array of: ${BO_MODULE_KEYS.join(', ')}` }, { status: 400 })
    }

    const resolvedKeys = resolveModuleDependencies(moduleKeys as BoModuleKey[])
    const lineItemsResult = await buildModuleLineItems(sql, org.id, resolvedKeys)
    if ('error' in lineItemsResult) return NextResponse.json({ error: lineItemsResult.error }, { status: 400 })
    const lineItems = lineItemsResult.lineItems

    const origin = req.headers.get('origin') ?? 'https://bario.ca'

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      ...(org.stripe_customer_id ? { customer: org.stripe_customer_id } : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { boOrgId: org.id, userId: user.id, moduleKeys: JSON.stringify(resolvedKeys) },
      line_items: lineItems,
      subscription_data: { trial_period_days: CARD_ON_FILE_TRIAL_DAYS },
      success_url: `${origin}/dashboard/bario-one?checkout=success`,
      cancel_url: `${origin}/dashboard/bario-one/modules`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
