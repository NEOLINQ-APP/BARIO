import type { User } from '@/lib/db'

// Admins get free, unlimited access to the builder/templates for testing —
// no subscription, credits, or verified email required.
// Everyone else needs a verified email before they can use the builder —
// unverified addresses are an easy way to farm free generations. Building
// and hosting is free for everyone; paying only removes the Bario badge,
// unlocks more sites/credits, and enables custom domains (see hasPaidPlan).
export function hasBuilderAccess(user: Pick<User, 'is_admin' | 'email_verified'>): boolean {
  if (user.is_admin) return true
  return user.email_verified
}

// Gates the things that are actually paid: removing the Bario badge,
// connecting a custom domain, and (once built) extra sites beyond the free
// tier's one. Checked live off subscription_status, not the cached `plan`
// column, so it reverts the instant a subscription lapses or cancels.
export function hasPaidPlan(user: Pick<User, 'subscription_status' | 'is_admin'>): boolean {
  if (user.is_admin) return true
  return user.subscription_status === 'active'
}
