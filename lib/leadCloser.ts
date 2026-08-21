import { randomUUID } from 'node:crypto'
import type { BoCustomer } from '@/lib/db'
import { createAgentTask } from '@/lib/agentTasks'

// Phase 5 (CLOSER) — deal-stage-triggered qualification + close planning,
// deliberately built on what Phases 2/3 already have rather than adding a
// separate signal-collection system: qualification reads the same
// lead_signals_json a person already fills in on the Lead Signals panel
// (lib/leadPipeline.ts), and the close plan reuses Phase 3's
// createAgentTask()/agency pipeline with a different trigger (deal stage,
// not lead priority) and a different objective (objection handling +
// next-best-action, not a first-touch follow-up).

// A lightweight BANT check (Budget/Authority/Need/Timeline) — not meant to
// be a definitive verdict, just a visible, explainable checkpoint logged to
// the lead's timeline every time a deal reaches the qualification stage, so
// a salesperson sees at a glance what's still unknown before investing more
// time.
export async function qualifyLead(sql: any, organizationId: string, customerId: string): Promise<void> {
  const customerRows = (await sql`SELECT * FROM bo_customers WHERE id = ${customerId} AND organization_id = ${organizationId}`) as unknown as BoCustomer[]
  const customer = customerRows[0]
  if (!customer) return

  let signals: Record<string, unknown> = {}
  try {
    signals = JSON.parse(customer.lead_signals_json || '{}')
  } catch {
    signals = {}
  }

  const deals = (await sql`SELECT value_cents FROM bo_deals WHERE customer_id = ${customerId} AND organization_id = ${organizationId}`) as unknown as { value_cents: number }[]
  const hasBudgetSignal = deals.some((d) => d.value_cents > 0)

  const bant = {
    budget: hasBudgetSignal ? 'known (deal has a value)' : 'unknown',
    authority: signals.businessIcpMatch || signals.customerTypeMatch ? 'likely (fit signals confirmed)' : 'unknown',
    need: signals.strongNeed || signals.problemIdentified ? 'confirmed' : 'unknown',
    timeline: typeof signals.timing === 'string' && signals.timing ? signals.timing : 'unknown',
  }
  const unknownDimensions = Object.entries(bant)
    .filter(([, v]) => v.startsWith('unknown'))
    .map(([k]) => k)
  const qualified = unknownDimensions.length <= 1

  const body = `CLOSER qualification check: ${qualified ? 'QUALIFIED' : 'NOT YET QUALIFIED'} (BANT).\nBudget: ${bant.budget}\nAuthority: ${bant.authority}\nNeed: ${bant.need}\nTimeline: ${bant.timeline}${
    unknownDimensions.length ? `\nStill need to find out: ${unknownDimensions.join(', ')} — update the Lead Signals panel once known.` : ''
  }`

  await sql`
    INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
    VALUES (${randomUUID()}, ${organizationId}, ${customerId}, 'note', ${body})
  `
}

// Queues a real agency task (via Phase 3's infra) once a deal reaches the
// quote stage — a genuinely different moment than a lead just turning red
// (Phase 3's trigger): this is late-stage, quote-in-hand momentum, and the
// objective is objection-handling + next step, not a first-touch message.
export async function queueClosePlan(sql: any, organizationId: string, customerId: string, dealTitle: string, dealValueCents: number): Promise<void> {
  const customerRows = (await sql`SELECT contact_name, company_name FROM bo_customers WHERE id = ${customerId} AND organization_id = ${organizationId}`) as unknown as { contact_name: string; company_name: string | null }[]
  const customer = customerRows[0]
  if (!customer) return

  const valueText = dealValueCents > 0 ? ` (value: $${(dealValueCents / 100).toFixed(2)})` : ''
  await createAgentTask(sql, {
    title: `Close plan: ${customer.contact_name}${customer.company_name ? ` (${customer.company_name})` : ''} — ${dealTitle}`,
    objective: `This deal ("${dealTitle}") just moved to the quote stage${valueText}. Write a close plan: the most likely objections at this stage and how to handle each, plus the single next best action to move it from quote to won.`,
    targetAgent: 'sales',
    sourceAgent: 'closer',
    leadId: customerId,
  })
}
