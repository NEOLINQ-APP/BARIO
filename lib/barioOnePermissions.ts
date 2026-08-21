import type { BoMembership } from '@/lib/db'

// Business OS Step 10 — granular permissions as a pure derived function
// over the EXISTING role column, not a new table. Confirmed before
// building this: no granular permission system exists anywhere in the
// codebase (bo_memberships.role + requireBoModule()'s module gate is the
// entire authorization surface today). This adds a finer-grained read on
// top without touching that surface, so "existing roles continue
// working" holds by construction — nothing about role storage or
// resolution changes.
export const BO_PERMISSIONS = [
  'marketing.view', 'marketing.create', 'marketing.edit', 'marketing.manage',
  'spott.view', 'spott.manage', 'spott.publish',
  'analytics.view',
  'automation.view', 'automation.manage',
  'ai.view', 'ai.manage',
] as const
export type BoPermission = (typeof BO_PERMISSIONS)[number]

// Same "employee is scoped, owner/admin aren't" rule already enforced
// everywhere else in this codebase (isRecordVisibleToMember, deal
// reassignment being owner/admin-only) — employees get view/create on
// the new modules, never manage/edit/publish.
const EMPLOYEE_ALLOWED: BoPermission[] = ['marketing.view', 'marketing.create', 'spott.view', 'analytics.view', 'automation.view', 'ai.view']

export function hasPermission(role: BoMembership['role'], permission: BoPermission): boolean {
  if (role === 'owner' || role === 'admin') return true
  return EMPLOYEE_ALLOWED.includes(permission)
}
