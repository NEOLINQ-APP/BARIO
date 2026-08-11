import { getActiveOrgForUser } from '@/lib/barioOne'
import { ensureModulesForOrg, hasModule, type BoModuleKey } from '@/lib/barioOneModules'

// Server-side page gate, mirrors requireBoModule()'s API-side logic but for
// a page component instead of a route handler — a page can't "return
// NextResponse", so this reports state and lets the page decide (redirect
// to onboarding if there's no org at all, render the locked-module card if
// there's an org but this module isn't on).
export async function getBoModuleGate(
  sql: any,
  userId: string,
  moduleKey: BoModuleKey
): Promise<{ hasOrg: boolean; locked: boolean }> {
  const found = await getActiveOrgForUser(sql, userId)
  if (!found) return { hasOrg: false, locked: true }

  const org = await ensureModulesForOrg(sql, found.org)
  return { hasOrg: true, locked: !hasModule(org, moduleKey) }
}
