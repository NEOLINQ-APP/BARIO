// Concrete implementation of "friction on first-time/high-risk purchases" —
// the classic abuse pattern for instant-provision compute is a stolen card
// on a brand-new account, so every account's first VPS order is held for a
// human look regardless of Radar's own score. Cheap, one-time-per-customer
// insurance rather than a recurring cost once an account is established.
export function shouldHoldForReview(opts: {
  riskLevel: 'normal' | 'elevated' | 'highest' | 'unknown'
  isFirstVpsOrderForUser: boolean
  accountAgeHours: number
}): boolean {
  if (opts.riskLevel === 'elevated' || opts.riskLevel === 'highest') return true
  if (opts.isFirstVpsOrderForUser) return true
  if (opts.accountAgeHours < 48) return true
  return false
}
