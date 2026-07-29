// Site-count ceiling per plan. Free and Starter are both capped at 1 —
// paying only raises the ceiling starting at Business. Admins and any
// unrecognized/free-tier plan value fall back to the safe default of 1.
// Agency is a real number, not unlimited — marketed as "unlimited" with no
// cap anywhere (code or ToS) is unenforceable exposure: nothing would stop
// one account from creating thousands of sites, effectively sub-reselling
// Agency hosting to their own clients on a single $149/mo account. 25 is
// generous for a legitimate small-to-mid agency's real client count while
// still being a real, defensible limit.
const MAX_SITES: Record<string, number> = {
  starter: 1,
  business: 5,
  agency: 25,
}

export function maxSitesForPlan(plan: string | null, isAdmin: boolean): number {
  if (isAdmin) return Infinity
  if (!plan) return 1
  return MAX_SITES[plan] ?? 1
}
