import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'
import type { User, BoOrganization } from '@/lib/db'

// View or set a hosting+CRM+domains billing hold for an account — one
// shared date, not three, so extending it extends all three together (see
// the comment on users.comp_protected_until in lib/db.ts). Enforced in
// app/api/checkout, app/api/bario-one/modules/{checkout,update}, and
// app/api/domains/register — this route only reads/writes the flag itself.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const email = new URL(req.url).searchParams.get('email')?.trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

    const rows = (await sql`SELECT * FROM users WHERE email = ${email}`) as unknown as User[]
    const user = rows[0]
    if (!user) return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })

    const orgs = (await sql`SELECT * FROM bo_organizations WHERE owner_user_id = ${user.id}`) as unknown as BoOrganization[]

    return NextResponse.json({
      ok: true,
      email: user.email,
      compProtectedUntil: user.comp_protected_until,
      hosting: { plan: user.plan, subscriptionStatus: user.subscription_status, hasRealSubscription: Boolean(user.stripe_subscription_id) },
      barioOneOrgs: orgs.map((o) => ({
        id: o.id, name: o.name, subscriptionStatus: o.subscription_status,
        hasRealSubscription: Boolean(o.stripe_subscription_id),
        enabledModules: JSON.parse(o.enabled_modules_json || '[]'),
        trialEndsAt: o.trial_ends_at,
      })),
    })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email, protectedUntil } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }
    // protectedUntil: null/omitted clears the hold; an ISO date string sets it.
    const until = protectedUntil ? new Date(protectedUntil) : null
    if (protectedUntil && Number.isNaN(until?.getTime())) {
      return NextResponse.json({ error: 'protectedUntil must be a valid date or null' }, { status: 400 })
    }

    const rows = (await sql`
      UPDATE users SET comp_protected_until = ${until}
      WHERE email = ${email.trim().toLowerCase()}
      RETURNING id, email, comp_protected_until
    `) as unknown as { id: string; email: string; comp_protected_until: string | null }[]

    if (!rows[0]) return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })

    await logAdminAction(sql, { action: 'set-billing-protection', targetEmail: rows[0].email, params: { protectedUntil: rows[0].comp_protected_until }, result: 'ok' })
    return NextResponse.json({ ok: true, email: rows[0].email, compProtectedUntil: rows[0].comp_protected_until })
  } catch (err) {
    return errorResponse(err)
  }
}
