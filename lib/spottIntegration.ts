import { randomUUID } from 'node:crypto'
import { findDuplicateLead, recalculateLeadScore } from '@/lib/leadPipeline'
import { recalculateLifecycleStage } from '@/lib/customerLifecycle'
import { recordLeadSource } from '@/lib/leadAttribution'

// Business OS Step 7 — "every Spott lead must be capable of being
// associated with an existing CRM contact or creating a new one." Same
// findDuplicateLead()-based dedup pattern SCOUT already uses
// (lib/leadPipeline.ts) so a Spott-sourced lead behaves exactly like any
// other discovered lead once it lands. Real and callable, but nothing
// auto-invokes this yet — there's no live Spott sync, per Step 7's own
// "prepare the integration architecture," not "build the integration."
export async function linkOrCreateContactFromSpottLead(
  sql: any,
  organizationId: string,
  spottLead: { contactName: string | null; phone: string | null; email: string | null }
): Promise<string | null> {
  const contactName = spottLead.contactName?.trim()
  if (!contactName) return null

  const duplicate = await findDuplicateLead(sql, organizationId, { email: spottLead.email, phone: spottLead.phone, companyName: null })
  if (duplicate) return duplicate.id

  const id = randomUUID()
  await sql`
    INSERT INTO bo_customers (id, organization_id, contact_name, phone, email, tags_json, source)
    VALUES (${id}, ${organizationId}, ${contactName}, ${spottLead.phone || null}, ${spottLead.email || null}, '["spott"]', 'spott')
  `
  await recordLeadSource(sql, id, { source: 'spott' })
  await recalculateLeadScore(sql, organizationId, id)
  await recalculateLifecycleStage(sql, organizationId, id)
  return id
}
