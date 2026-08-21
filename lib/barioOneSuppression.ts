import { randomBytes } from 'node:crypto'

// Phase 7 suppression hardening — the one place every Bario One send path
// (bulk campaigns, rule-based automations, and anywhere else added later)
// should check before emailing/texting a customer. Twenty CRM's
// crm_do_not_contact (lib/crmOutreach.ts) doesn't apply here; that system
// is separately disabled and person_id-keyed against a CRM this platform
// doesn't use anymore. This is a flag directly on bo_customers instead.

export async function isSuppressed(sql: any, customerId: string): Promise<boolean> {
  const rows = (await sql`SELECT do_not_contact FROM bo_customers WHERE id = ${customerId}`) as unknown as { do_not_contact: boolean }[]
  return rows[0]?.do_not_contact === true
}

export async function setDoNotContact(sql: any, organizationId: string, customerId: string, value: boolean, reason?: string | null): Promise<void> {
  await sql`
    UPDATE bo_customers SET do_not_contact = ${value}, do_not_contact_reason = ${value ? reason || null : null}, updated_at = now()
    WHERE id = ${customerId} AND organization_id = ${organizationId}
  `
}

// Every customer gets the same token once generated (not per-email) — a
// stop-emailing-me request should apply platform-wide for that org, not
// just to the one campaign whose link they happened to click.
export async function getOrCreateUnsubscribeToken(sql: any, customerId: string): Promise<string> {
  const rows = (await sql`SELECT unsubscribe_token FROM bo_customers WHERE id = ${customerId}`) as unknown as { unsubscribe_token: string | null }[]
  const existing = rows[0]?.unsubscribe_token
  if (existing) return existing

  const token = randomBytes(16).toString('hex')
  await sql`UPDATE bo_customers SET unsubscribe_token = ${token} WHERE id = ${customerId} AND unsubscribe_token IS NULL`
  // Re-read rather than trust the value we just wrote — a concurrent call
  // for the same customer could have won the race and set its own token
  // first (the WHERE ... IS NULL guard means at most one write wins).
  const finalRows = (await sql`SELECT unsubscribe_token FROM bo_customers WHERE id = ${customerId}`) as unknown as { unsubscribe_token: string | null }[]
  return finalRows[0]?.unsubscribe_token || token
}
