import { randomUUID } from 'node:crypto'

// Single source of truth for the VPS Acceptable Use Policy's current
// version — shared by the AUP content page and the order form's acceptance
// checkbox so they can never drift out of sync. Bump this string any time
// the policy content actually changes; past acceptances keep the version
// they agreed to (legal_acceptances.policy_version is never rewritten).
export const CURRENT_VPS_POLICY_VERSION = '2026-07-28'

export async function recordLegalAcceptance(
  sql: any,
  opts: { userId: string; policySlug: string; policyVersion: string; ip?: string | null; userAgent?: string | null }
): Promise<string> {
  const id = randomUUID()
  await sql`
    INSERT INTO legal_acceptances (id, user_id, policy_slug, policy_version, ip_address, user_agent)
    VALUES (${id}, ${opts.userId}, ${opts.policySlug}, ${opts.policyVersion}, ${opts.ip ?? null}, ${opts.userAgent ?? null})
  `
  return id
}
