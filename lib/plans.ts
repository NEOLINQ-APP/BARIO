// Site-count ceiling per plan. Free and Starter are both capped at 1 —
// paying only raises the ceiling starting at Business. Admins and any
// unrecognized/free-tier plan value fall back to the safe default of 1.
const MAX_SITES: Record<string, number> = {
  starter: 1,
  business: 5,
  agency: Infinity,
}

export function maxSitesForPlan(plan: string | null, isAdmin: boolean): number {
  if (isAdmin) return Infinity
  if (!plan) return 1
  return MAX_SITES[plan] ?? 1
}
