import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { creditsForPlan } from '@/lib/credits'
import { errorResponse } from '@/lib/errors'

const VALID_PLANS = ['starter', 'business', 'agency']

// Manually comps a plan onto an existing account — no Stripe subscription
// involved, so this never touches stripe_customer_id/stripe_subscription_id.
// hasPaidPlan() only checks subscription_status, so setting it 'active'
// here correctly unlocks badge removal/custom domain/family sharing etc.
// exactly like a real paid account, and it stays that way indefinitely
// since there's no real subscription to lapse or get canceled — a deliberate
// comp, not a trial.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email, plan } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (!VALID_PLANS.includes(plan)) {
      return NextResponse.json({ error: `Plan must be one of: ${VALID_PLANS.join(', ')}` }, { status: 400 })
    }

    const rows = (await sql`
      UPDATE users
      SET plan = ${plan},
          subscription_status = 'active',
          credits_remaining = ${creditsForPlan(plan)},
          credits_reset_at = now() + interval '1 month'
      WHERE email = ${email.trim().toLowerCase()}
      RETURNING id, email, plan
    `) as unknown as { id: string; email: string; plan: string }[]

    if (!rows[0]) {
      return NextResponse.json({ error: `No account found for ${email} — they need to sign up first` }, { status: 404 })
    }

    return NextResponse.json({ ok: true, user: rows[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
