import { randomUUID } from 'node:crypto'
import type { BoCustomer, BoDeal, BoTask, LeadPriority } from '@/lib/db'
import { getLeadScoreWeights, type LeadScoreWeights } from '@/lib/leadScoreConfig'

// The only sanctioned write path to lead scoring/priority/duplicate-check
// data. Agents (and any future automation) must go through these functions
// rather than writing bo_customers/lead_scores/priority_history directly —
// same "controlled application services, not raw table access" rule the
// spec calls for, matching the trust model lib/neoActions.ts already uses
// for NEO's safe-action registry.

function last10Digits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

export type DuplicateMatch = {
  id: string
  contactName: string
  companyName: string | null
  matchedOn: 'email' | 'phone' | 'company_and_address'
}

// Checks email / phone / company+address — the 3 signals actually available
// on bo_customers today (no domain/website column exists yet, so domain
// matching from the original spec isn't implemented until one is added).
export async function findDuplicateLead(
  sql: any,
  organizationId: string,
  input: { email?: string | null; phone?: string | null; companyName?: string | null; address?: string | null }
): Promise<DuplicateMatch | null> {
  const email = input.email?.trim().toLowerCase() || null
  const phone = input.phone ? last10Digits(input.phone) : null
  const companyName = input.companyName?.trim().toLowerCase() || null
  const address = input.address?.trim().toLowerCase() || null

  if (email) {
    const rows = (await sql`
      SELECT id, contact_name, company_name FROM bo_customers
      WHERE organization_id = ${organizationId} AND lower(email) = ${email}
      LIMIT 1
    `) as unknown as { id: string; contact_name: string; company_name: string | null }[]
    if (rows[0]) return { id: rows[0].id, contactName: rows[0].contact_name, companyName: rows[0].company_name, matchedOn: 'email' }
  }

  if (phone) {
    const rows = (await sql`
      SELECT id, contact_name, company_name FROM bo_customers
      WHERE organization_id = ${organizationId} AND phone IS NOT NULL AND right(regexp_replace(phone, '\D', '', 'g'), 10) = ${phone}
      LIMIT 1
    `) as unknown as { id: string; contact_name: string; company_name: string | null }[]
    if (rows[0]) return { id: rows[0].id, contactName: rows[0].contact_name, companyName: rows[0].company_name, matchedOn: 'phone' }
  }

  if (companyName && address) {
    const rows = (await sql`
      SELECT id, contact_name, company_name FROM bo_customers
      WHERE organization_id = ${organizationId} AND lower(company_name) = ${companyName} AND lower(address) = ${address}
      LIMIT 1
    `) as unknown as { id: string; contact_name: string; company_name: string | null }[]
    if (rows[0]) return { id: rows[0].id, contactName: rows[0].contact_name, companyName: rows[0].company_name, matchedOn: 'company_and_address' }
  }

  return null
}

export function calculateLeadScore(
  weights: LeadScoreWeights,
  signals: {
    locationMatch?: boolean
    serviceMatch?: boolean
    customerTypeMatch?: boolean
    businessIcpMatch?: boolean
    hasProviderCapacity?: boolean
    strongNeed?: boolean
    problemIdentified?: boolean
    goalIdentified?: boolean
    quoteRequested?: boolean
    appointmentRequested?: boolean
    readyToPurchase?: boolean
    isEmergency?: boolean
    timing?: 'today' | 'this_week' | 'this_month' | 'one_to_three_months' | 'future' | null
    hasValidPhone?: boolean
    hasValidEmail?: boolean
    hasLocation?: boolean
    hasNeed?: boolean
    hasSource?: boolean
  }
): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {}
  const add = (key: string, condition: boolean | undefined, points: number) => {
    breakdown[key] = condition ? points : 0
  }

  add('locationMatch', signals.locationMatch, weights.fit.locationMatch)
  add('serviceMatch', signals.serviceMatch, weights.fit.serviceMatch)
  add('customerTypeMatch', signals.customerTypeMatch, weights.fit.customerTypeMatch)
  add('businessIcpMatch', signals.businessIcpMatch, weights.fit.businessIcpMatch)
  add('providerCapacity', signals.hasProviderCapacity, weights.fit.providerCapacity)

  add('strongNeed', signals.strongNeed, weights.need.strongNeed)
  add('problemIdentified', signals.problemIdentified, weights.need.problemIdentified)
  add('goalIdentified', signals.goalIdentified, weights.need.goalIdentified)

  add('quoteRequested', signals.quoteRequested, weights.intent.quoteRequested)
  add('appointmentRequested', signals.appointmentRequested, weights.intent.appointmentRequested)
  add('readyToPurchase', signals.readyToPurchase, weights.intent.readyToPurchase)
  add('emergencyUrgency', signals.isEmergency, weights.intent.emergencyUrgency)

  const timingPoints: Record<string, number> = {
    today: weights.timing.today,
    this_week: weights.timing.thisWeek,
    this_month: weights.timing.thisMonth,
    one_to_three_months: weights.timing.oneToThreeMonths,
    future: weights.timing.future,
  }
  breakdown.timing = signals.timing ? timingPoints[signals.timing] ?? 0 : 0

  add('validPhone', signals.hasValidPhone, weights.dataQuality.validPhone)
  add('validEmail', signals.hasValidEmail, weights.dataQuality.validEmail)
  add('locationKnown', signals.hasLocation, weights.dataQuality.location)
  add('needKnown', signals.hasNeed, weights.dataQuality.need)
  add('sourceKnown', signals.hasSource, weights.dataQuality.source)

  const rawScore = Object.values(breakdown).reduce((sum, v) => sum + v, 0)
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))
  return { score, breakdown }
}

// Default thresholds match the spec's 80-100/50-79/0-49 model. GREY is
// never derived from score alone — it's an explicit disqualification
// (duplicate, spam, invalid, outside service area, closed lost, etc.),
// same as the spec's own "Grey does NOT mean bad [score], it means
// inactive" distinction.
export function calculatePriority(score: number, opts?: { disqualified?: boolean; disqualifiedReason?: string }): { priority: LeadPriority; reason: string } {
  if (opts?.disqualified) {
    return { priority: 'grey', reason: opts.disqualifiedReason || 'Marked inactive/unqualified.' }
  }
  if (score >= 80) return { priority: 'red', reason: `Score ${score}/100 — hot, act now.` }
  if (score >= 50) return { priority: 'yellow', reason: `Score ${score}/100 — warm, follow up.` }
  return { priority: 'green', reason: `Score ${score}/100 — nurture, low immediate priority.` }
}

// Writes a new lead_scores row, a new priority_history row, and updates
// bo_customers' cached current_score/current_priority — always together, so
// the cache never drifts from the history it's derived from.
export async function recordPriorityChange(
  sql: any,
  organizationId: string,
  customerId: string,
  score: number,
  breakdown: Record<string, number>,
  priority: LeadPriority,
  reason: string
): Promise<void> {
  await sql`
    INSERT INTO lead_scores (id, customer_id, organization_id, score, breakdown_json)
    VALUES (${randomUUID()}, ${customerId}, ${organizationId}, ${score}, ${JSON.stringify(breakdown)})
  `
  await sql`
    INSERT INTO priority_history (id, customer_id, organization_id, priority, score, reason)
    VALUES (${randomUUID()}, ${customerId}, ${organizationId}, ${priority}, ${score}, ${reason})
  `
  await sql`
    UPDATE bo_customers SET current_score = ${score}, current_priority = ${priority}, updated_at = now()
    WHERE id = ${customerId}
  `
}

type LeadSignalInputs = Parameters<typeof calculateLeadScore>[1]

// Everything calculateLeadScore() can take is either (a) objectively
// derivable from data already on the record/deals — data quality signals,
// and pipeline-stage-implied intent — or (b) something only a human (or a
// future SCOUT/CLOSER agent) can actually judge, like "is this a strong
// need" or "does this fit our ICP." This function only computes (a); (b)
// comes from bo_customers.lead_signals_json, entered once via the CRM UI
// and then reused on every automatic recalculation until changed.
function deriveAutoSignals(customer: BoCustomer, deals: BoDeal[], tasks: BoTask[]): LeadSignalInputs {
  const stages = new Set(deals.map((d) => d.stage.toLowerCase()))
  const tags: string[] = (() => {
    try {
      return JSON.parse(customer.tags_json || '[]')
    } catch {
      return []
    }
  })()

  return {
    hasValidPhone: !!customer.phone && customer.phone.replace(/\D/g, '').length >= 10,
    hasValidEmail: !!customer.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email),
    hasLocation: !!customer.address,
    hasSource: !!customer.source,
    hasNeed: tags.length > 0, // a tagged lead has at least some qualifying context recorded
    // Deal-stage-implied intent — deliberately tolerant of custom pipeline
    // stage keys (an org can rename/add stages), so this only fires on the
    // stock stage names rather than assuming every org's pipeline matches.
    quoteRequested: stages.has('quote') || stages.has('won'),
    readyToPurchase: stages.has('quote'),
    appointmentRequested: tasks.length > 0, // a follow-up task exists for this lead
    isEmergency: tags.some((t) => t.toLowerCase() === 'emergency'),
  }
}

// The one function that should actually run scoring end-to-end: derives
// what it can from real data, layers the human-entered signals on top
// (manual values always win — a person's judgment about need/fit/intent
// beats any heuristic), and writes the result. Called after every
// customer create/edit and every deal stage change so a lead's
// score/priority never goes stale without anyone having to remember to
// press a button.
export async function recalculateLeadScore(sql: any, organizationId: string, customerId: string): Promise<{ score: number; priority: LeadPriority; reason: string } | null> {
  const customerRows = (await sql`SELECT * FROM bo_customers WHERE id = ${customerId} AND organization_id = ${organizationId}`) as unknown as BoCustomer[]
  const customer = customerRows[0]
  if (!customer) return null

  const [deals, tasks] = await Promise.all([
    sql`SELECT * FROM bo_deals WHERE customer_id = ${customerId} AND organization_id = ${organizationId}` as Promise<BoDeal[]>,
    sql`SELECT * FROM bo_tasks WHERE customer_id = ${customerId} AND organization_id = ${organizationId}` as Promise<BoTask[]>,
  ])

  let manualSignals: Record<string, unknown> = {}
  try {
    manualSignals = JSON.parse(customer.lead_signals_json || '{}')
  } catch {
    manualSignals = {}
  }

  const autoSignals = deriveAutoSignals(customer, deals, tasks)
  // Only overlay manual keys that are actually present — an unset manual
  // field must fall back to the derived value, not clobber it with
  // `undefined` (which would silently zero out that scoring line).
  const signals: LeadSignalInputs = { ...autoSignals }
  for (const [key, value] of Object.entries(manualSignals)) {
    if (key === 'disqualified' || key === 'disqualifiedReason') continue
    if (value !== undefined) (signals as any)[key] = value
  }

  const weights = await getLeadScoreWeights(sql)
  const { score, breakdown } = calculateLeadScore(weights, signals)
  const { priority, reason } = calculatePriority(score, {
    disqualified: manualSignals.disqualified === true,
    disqualifiedReason: typeof manualSignals.disqualifiedReason === 'string' ? manualSignals.disqualifiedReason : undefined,
  })

  await recordPriorityChange(sql, organizationId, customerId, score, breakdown, priority, reason)
  return { score, priority, reason }
}

export async function getLeadTimeline(sql: any, customerId: string): Promise<Array<{ type: 'note' | 'priority_change'; at: string; data: any }>> {
  const [notes, priorityChanges] = await Promise.all([
    sql`SELECT id, kind, body, created_at FROM bo_notes WHERE customer_id = ${customerId} ORDER BY created_at DESC`,
    sql`SELECT id, priority, score, reason, changed_at FROM priority_history WHERE customer_id = ${customerId} ORDER BY changed_at DESC`,
  ])
  const timeline = [
    ...(notes as any[]).map((n) => ({ type: 'note' as const, at: n.created_at, data: n })),
    ...(priorityChanges as any[]).map((p) => ({ type: 'priority_change' as const, at: p.changed_at, data: p })),
  ]
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return timeline
}
