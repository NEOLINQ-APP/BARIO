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

// Same gate as the builder — verified email or admin. Studio isn't a
// separate paid tier of its own; it's metered by credits like the builder,
// so access itself follows the same "free to try, credits limit you" rule.
export function hasStudioAccess(user: Pick<User, 'is_admin' | 'email_verified'>): boolean {
  return hasBuilderAccess(user)
}

// Same "verified email or admin" gate as the builder/Studio. Bario Build
// additionally requires its own AUP acceptance (a new sandbox_aup policy
// slug, separate from studio_aup — the risk profile of running arbitrary
// code is genuinely different from GPU media generation) checked separately
// at the route level, since that's a per-request legal_acceptances lookup
// rather than a static property of the user row.
export function hasBuildAccess(user: Pick<User, 'is_admin' | 'email_verified'>): boolean {
  return hasBuilderAccess(user)
}

// Temporary lockdown, 2026-08-24: Studio + the AI website builder (Zeus/
// Sky) are restricted to admin + one specific account while the user
// finishes verifying they work correctly. Deliberately separate from
// hasBuilderAccess/hasStudioAccess above (which stay unchanged and keep
// gating X-Drive, VPS/WP config, and site-audit as before) so this doesn't
// widen beyond what was asked. Revert by deleting this function and
// switching its call sites back to hasBuilderAccess/hasStudioAccess once
// the user gives the go-ahead to reopen access.
const LOCKDOWN_ALLOWED_EMAIL = 'uniquegroup.org@gmail.com'
export function hasZeusStudioAccess(user: Pick<User, 'is_admin' | 'email'>): boolean {
  if (user.is_admin) return true
  return user.email?.toLowerCase() === LOCKDOWN_ALLOWED_EMAIL
}
