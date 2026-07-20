import type { User } from '@/lib/db'

// Admins get free, unlimited access to the builder/templates for testing —
// no subscription or credits required.
export function hasBuilderAccess(user: Pick<User, 'subscription_status' | 'is_admin'>): boolean {
  return user.subscription_status === 'active' || user.is_admin
}
