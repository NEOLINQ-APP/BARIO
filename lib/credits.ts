import type { User } from '@/lib/db'

export const PLAN_CREDITS: Record<string, number> = {
  free: 15,
  starter: 75,
  business: 200,
  agency: 750,
}

// No plan (never subscribed, or subscription lapsed) falls back to the free
// tier's allotment — building/hosting is free for everyone now, only the
// badge/domain/site-count perks are actually paid.
export function creditsForPlan(plan: string | null): number {
  return plan ? PLAN_CREDITS[plan] ?? PLAN_CREDITS.free : PLAN_CREDITS.free
}

// Lazily refills a user's credits if their reset date has passed, since
// there's no cron job wired up — this runs the check on the next request
// that touches credits rather than on a schedule. A null reset date means
// this account has never been initialized (e.g. a free signup that never
// went through Stripe), so it's treated as due for its first refill too.
export async function ensureCreditsRefreshed(sql: any, user: User): Promise<number> {
  if (!user.credits_reset_at || new Date(user.credits_reset_at) <= new Date()) {
    const fresh = creditsForPlan(user.plan)
    await sql`
      UPDATE users
      SET credits_remaining = ${fresh}, credits_reset_at = now() + interval '1 month'
      WHERE id = ${user.id}
    `
    return fresh
  }
  return user.credits_remaining
}
