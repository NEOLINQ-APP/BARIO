import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Real cross-product usage signal — which of the 82 signed-up accounts have
// actually touched each product, not just registered. Excludes disposable
// @bario-internal-test.com accounts (created during this project's own
// testing) so the numbers reflect real users, not test noise.
//
// Deliberately sequential, not Promise.all — lib/db.ts's postgres.js client
// is capped at `max: 1` pooled connection per invocation (Supavisor
// transaction-mode pooling), so firing ~16 queries concurrently doesn't
// actually run them in parallel anyway, it just queues them behind that one
// connection — and in practice that produced a real hang (Cloudflare 524,
// no response within 100s) rather than a clean queue-and-wait. Sequential
// awaits against the same single connection is the pattern every other
// multi-query route in this codebase already uses.
export const maxDuration = 60

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const totalRealUsers = (await sql`SELECT count(*)::int AS c FROM users WHERE email NOT LIKE '%@bario-internal-test.com'`)[0].c
    const testAccountsExcluded = (await sql`SELECT count(*)::int AS c FROM users WHERE email LIKE '%@bario-internal-test.com'`)[0].c
    const paidSitePlanAccounts = (await sql`SELECT count(*)::int AS c FROM users WHERE subscription_status = 'active'`)[0].c
    const publishedASite = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM sites WHERE is_published = true`)[0].c
    const createdAnySite = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM sites`)[0].c
    const orderedVps = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM vps_instances WHERE status != 'pending_payment'`)[0].c
    const paidStorageTier = (await sql`SELECT count(*)::int AS c FROM users WHERE storage_tier != 'free'`)[0].c
    const orderedVoiceAgent = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM voice_agent_orders`)[0].c
    const orderedDomain = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM domain_orders`)[0].c
    const hasCrmStack = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM crm_stacks`)[0].c
    const joinedBarioOne = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM bo_memberships`)[0].c
    const purchasedTemplate = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM template_licenses`)[0].c
    const hasWpHostingSite = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM wp_sites`)[0].c
    const connectedSocialAccount = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM social_connections`)[0].c
    const usedStudio = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM studio_jobs`)[0].c
    const createdEmailMailbox = (await sql`SELECT count(DISTINCT user_id)::int AS c FROM email_mailboxes`)[0].c

    return NextResponse.json({
      ok: true,
      totalRealUsers,
      testAccountsExcluded,
      paidSitePlanAccounts,
      productUsage: {
        publishedASite,
        createdAnySite,
        orderedVps,
        paidStorageTier,
        orderedVoiceAgent,
        orderedDomain,
        hasCrmStack,
        joinedBarioOne,
        purchasedTemplate,
        hasWpHostingSite,
        connectedSocialAccount,
        usedStudio,
        createdEmailMailbox,
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
