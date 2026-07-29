import { randomUUID } from 'node:crypto'

export { CURRENT_VPS_POLICY_VERSION } from '@/lib/legalVersion'

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
