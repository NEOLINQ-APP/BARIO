import { randomUUID } from 'node:crypto'
import type { LeadSourceValue } from '@/lib/db'

// Business OS Step 8 — the one sanctioned write path to lead_sources
// (extended, not duplicated — see lib/db.ts's comment on this table).
// bo_customers.source (the flat cache from Phases 4/6) is untouched by
// this; this is the real multi-touch detail table. Not wired into every
// existing lead-creation path this pass (Step 8 doesn't ask for a
// platform-wide backfill) — called from the new Spott/Appointments
// mutation points this pass adds.
export type LeadTouch = {
  source: LeadSourceValue
  sourceDetail?: string | null
  campaignId?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  creative?: string | null
  landingPage?: string | null
  referrer?: string | null
}

export async function recordLeadSource(sql: any, customerId: string, touch: LeadTouch): Promise<void> {
  await sql`
    INSERT INTO lead_sources (
      id, customer_id, source, source_detail, campaign_id,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      creative, landing_page, referrer
    )
    VALUES (
      ${randomUUID()}, ${customerId}, ${touch.source}, ${touch.sourceDetail || null}, ${touch.campaignId || null},
      ${touch.utmSource || null}, ${touch.utmMedium || null}, ${touch.utmCampaign || null}, ${touch.utmContent || null}, ${touch.utmTerm || null},
      ${touch.creative || null}, ${touch.landingPage || null}, ${touch.referrer || null}
    )
  `
}
