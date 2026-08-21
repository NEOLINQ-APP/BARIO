import type { BoCustomerLifecycleStage } from '@/lib/db'

// Business OS Phase 1 — the only sanctioned write path to bo_customers.
// lifecycle_stage, same "one function, called from every mutation point"
// shape as lib/leadPipeline.ts's recalculateLeadScore(). bo_customers
// stays the single identity row per person; this just makes explicit
// what stage of contact -> lead -> customer that row is currently in,
// derived from real signals already on the record rather than tracked
// separately and left to drift out of sync.
export function deriveLifecycleStage(hasWonDeal: boolean, hasBeenScored: boolean): BoCustomerLifecycleStage {
  if (hasWonDeal) return 'customer'
  if (hasBeenScored) return 'lead'
  return 'contact'
}

export async function recalculateLifecycleStage(sql: any, organizationId: string, customerId: string): Promise<BoCustomerLifecycleStage | null> {
  const rows = (await sql`
    SELECT current_priority FROM bo_customers WHERE id = ${customerId} AND organization_id = ${organizationId}
  `) as unknown as { current_priority: string | null }[]
  if (!rows[0]) return null

  const wonRows = (await sql`
    SELECT 1 FROM bo_deals WHERE customer_id = ${customerId} AND organization_id = ${organizationId} AND stage = 'won' LIMIT 1
  `) as unknown as unknown[]

  const stage = deriveLifecycleStage(wonRows.length > 0, rows[0].current_priority !== null)
  await sql`UPDATE bo_customers SET lifecycle_stage = ${stage}, updated_at = now() WHERE id = ${customerId}`
  return stage
}
