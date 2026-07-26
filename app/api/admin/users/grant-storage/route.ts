import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { isStorageTierKey, STORAGE_TIER_KEYS } from '@/lib/storageTiers'
import { errorResponse } from '@/lib/errors'

// Comps a Media Library storage tier onto an existing account — same
// pattern as grant-plan: no Stripe subscription involved, so
// stripe_storage_subscription_id stays untouched, and the tier just stays
// active indefinitely since there's nothing to lapse.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email, tier } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (!isStorageTierKey(tier)) {
      return NextResponse.json({ error: `Tier must be one of: ${STORAGE_TIER_KEYS.join(', ')}` }, { status: 400 })
    }

    const rows = (await sql`
      UPDATE users
      SET storage_tier = ${tier}, storage_subscription_status = 'active'
      WHERE email = ${email.trim().toLowerCase()}
      RETURNING id, email, storage_tier
    `) as unknown as { id: string; email: string; storage_tier: string }[]

    if (!rows[0]) {
      return NextResponse.json({ error: `No account found for ${email} — they need to sign up first` }, { status: 404 })
    }

    return NextResponse.json({ ok: true, user: rows[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
