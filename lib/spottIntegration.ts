import { randomUUID } from 'node:crypto'
import { findDuplicateLead, recalculateLeadScore } from '@/lib/leadPipeline'
import { recalculateLifecycleStage } from '@/lib/customerLifecycle'
import { recordLeadSource } from '@/lib/leadAttribution'
import type { SpottListing } from '@/lib/db'

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

export type SpottConnection = {
  listing: SpottListing
  apiKey: string
  webhookSigningSecret: string
}

// Shared by every Phase 2C route that needs to call out to Spott on this
// org's behalf — avoids repeating the listing/credentials join per route.
export async function getSpottConnection(sql: any, organizationId: string): Promise<SpottConnection | null> {
  const rows = (await sql`
    SELECT l.*, c.api_key, c.webhook_signing_secret
    FROM spott_listings l
    JOIN spott_connection_credentials c ON c.listing_id = l.id
    WHERE l.organization_id = ${organizationId} AND l.sync_status != 'not_connected'
    ORDER BY l.updated_at DESC LIMIT 1
  `) as unknown as (SpottListing & { api_key: string; webhook_signing_secret: string })[]
  const row = rows[0]
  if (!row) return null
  const { api_key, webhook_signing_secret, ...listing } = row
  return { listing: listing as SpottListing, apiKey: api_key, webhookSigningSecret: webhook_signing_secret }
}
