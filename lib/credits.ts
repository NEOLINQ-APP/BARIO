import type { User } from '@/lib/db'

export const PLAN_CREDITS: Record<string, number> = {
  starter: 75,
  business: 200,
  agency: 750,
}

export function creditsForPlan(plan: string | null): number {
  return plan ? PLAN_CREDITS[plan] ?? 0 : 0
}

// Lazily refills a user's credits if their reset date has passed, since
// there's no cron job wired up — this runs the check on the next request
// that touches credits rather than on a schedule.
export async function ensureCreditsRefreshed(sql: any, user: User): Promise<number> {
  if (user.credits_reset_at && new Date(user.credits_reset_at) <= new Date()) {
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
