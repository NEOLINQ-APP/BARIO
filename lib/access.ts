import type { User } from '@/lib/db'

// Admins get free, unlimited access to the builder/templates for testing —
// no subscription, credits, or verified email required.
// Everyone else needs a verified email before they can spend AI credits —
// unverified addresses are an easy way to farm free generations.
export function hasBuilderAccess(user: Pick<User, 'subscription_status' | 'is_admin' | 'email_verified'>): boolean {
  if (user.is_admin) return true
  return user.subscription_status === 'active' && user.email_verified
}
