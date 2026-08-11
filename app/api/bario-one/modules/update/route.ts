import { NextResponse } from 'next/server'
import { getStripe, BO_MODULE_PRICE_IDS } from '@/lib/stripe'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getActiveOrgForUser } from '@/lib/barioOne'
import { BO_MODULE_KEYS, resolveModuleDependencies, type BoModuleKey } from '@/lib/barioOneModules'
import { errorResponse } from '@/lib/errors'

// Self-serve add/remove modules on an ALREADY-active subscription — direct
// subscription-item create/delete against the existing Stripe subscription
// (Stripe prorates automatically), no new Checkout session needed.
// Optimistically writes enabled_modules_json immediately so the dashboard
// reflects the change right away; the webhook's
// customer.subscription.updated handler re-derives the same state from
// Stripe afterward, which is the reconciled source of truth if the two
// ever disagree (e.g. a change made directly in the Stripe dashboard).
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
    if (!org.stripe_subscription_id) {
      return NextResponse.json({ error: 'No active subscription yet — use the module checkout endpoint first' }, { status: 400 })
    }

    const { moduleKeys } = await req.json()
    if (!Array.isArray(moduleKeys) || !moduleKeys.every((k) => (BO_MODULE_KEYS as string[]).includes(k))) {
      return NextResponse.json({ error: `moduleKeys must be an array of: ${BO_MODULE_KEYS.join(', ')}` }, { status: 400 })
    }

    const desiredKeys = resolveModuleDependencies(moduleKeys as BoModuleKey[])
    if (desiredKeys.length === 0) {
      return NextResponse.json({ error: 'A subscription needs at least one module — cancel your subscription entirely instead' }, { status: 400 })
    }

    const stripe = getStripe()
    const items = await stripe.subscriptionItems.list({ subscription: org.stripe_subscription_id, limit: 100 })
    const currentPriceIdToItemId = new Map(items.data.map((i) => [i.price.id, i.id]))
    const currentModuleKeys = BO_MODULE_KEYS.filter((k) => {
      const priceId = BO_MODULE_PRICE_IDS[k]
      return priceId && currentPriceIdToItemId.has(priceId)
    })

    const toAdd = desiredKeys.filter((k) => !currentModuleKeys.includes(k))
    const toRemove = currentModuleKeys.filter((k) => !desiredKeys.includes(k))

    for (const key of toAdd) {
      const priceId = BO_MODULE_PRICE_IDS[key]
      if (!priceId) return NextResponse.json({ error: `The ${key} module isn't available for purchase right now` }, { status: 400 })
      await stripe.subscriptionItems.create({ subscription: org.stripe_subscription_id, price: priceId })
    }
    for (const key of toRemove) {
      const itemId = currentPriceIdToItemId.get(BO_MODULE_PRICE_IDS[key]!)
      if (itemId) await stripe.subscriptionItems.del(itemId)
    }

    const json = JSON.stringify(desiredKeys)
    await sql`UPDATE bo_organizations SET enabled_modules_json = ${json}, updated_at = now() WHERE id = ${org.id}`

    return NextResponse.json({ ok: true, enabledModules: desiredKeys, added: toAdd, removed: toRemove })
  } catch (err: any) {
    return errorResponse(err)
  }
}
