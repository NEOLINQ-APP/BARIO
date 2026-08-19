import { randomUUID } from 'node:crypto'

export type NeoSeverity = 'info' | 'warning' | 'critical'

// Records (or re-touches) one detected problem. Re-detecting the same open
// issue on a later health-check run doesn't create a duplicate row — it
// just bumps last_seen_at on the existing one (see the partial unique
// index in lib/db.ts), so a persistent problem shows one incident with a
// growing "still happening" window, not fifteen identical rows an hour.
export async function recordIncident(
  sql: any,
  opts: {
    source: string
    category: string
    severity: NeoSeverity
    description: string
    details?: Record<string, unknown>
  }
): Promise<void> {
  await sql`
    INSERT INTO neo_incidents (id, source, category, severity, description, details_json)
    VALUES (${randomUUID()}, ${opts.source}, ${opts.category}, ${opts.severity}, ${opts.description}, ${JSON.stringify(opts.details ?? {})})
    ON CONFLICT (source, category, description) WHERE status IN ('detected', 'needs_review', 'pending_approval')
    DO UPDATE SET last_seen_at = now(), details_json = EXCLUDED.details_json
  `
}

// Marks an incident resolved because a fresh health check run no longer
// reproduces it — used at the top of each check so a since-recovered
// problem doesn't sit open forever waiting for someone to notice it fixed
// itself (a flaky DNS blip, a transient timeout, etc.).
export async function autoResolveIfMissing(sql: any, source: string, category: string, stillOpenDescriptions: string[]): Promise<void> {
  if (stillOpenDescriptions.length === 0) {
    await sql`
      UPDATE neo_incidents SET status = 'resolved', resolved_at = now()
      WHERE source = ${source} AND category = ${category} AND status IN ('detected', 'needs_review', 'pending_approval')
    `
    return
  }
  await sql`
    UPDATE neo_incidents SET status = 'resolved', resolved_at = now()
    WHERE source = ${source} AND category = ${category} AND status IN ('detected', 'needs_review', 'pending_approval')
      AND NOT (description = ANY(${stillOpenDescriptions}))
  `
}

// Flips a detected incident to 'pending_approval' with the exact tool+args
// NEO wants to run — used by a category with an entry in
// lib/neoApprovalActions.ts. Distinct from recordAutoFix(): this never
// executes anything itself, only proposes, and only for a category
// explicitly registered as understood + safe-to-propose (same discipline
// as the safe-action registry, just with a human click required).
export async function proposeApprovalAction(
  sql: any,
  source: string,
  category: string,
  description: string,
  proposal: { tool: string; args: Record<string, unknown>; label: string }
): Promise<void> {
  await sql`
    UPDATE neo_incidents
    SET status = 'pending_approval', proposed_tool = ${proposal.tool}, proposed_args_json = ${JSON.stringify(proposal.args)}, proposed_label = ${proposal.label}
    WHERE source = ${source} AND category = ${category} AND description = ${description} AND status IN ('detected', 'needs_review')
  `
}

// Records that a registered safe action (lib/neoActions.ts) fired for a
// detected incident — flips it straight to 'auto_fixed' instead of sitting
// in 'needs_review' for a human. Only ever called from a category that has
// an explicit entry in NEO_SAFE_ACTIONS; there is no path for NEO to mark
// something auto-fixed without a registered action actually having run.
export async function recordAutoFix(sql: any, source: string, category: string, description: string, actionTaken: string): Promise<void> {
  await sql`
    UPDATE neo_incidents
    SET status = 'auto_fixed', action_taken = ${actionTaken}, resolved_at = now()
    WHERE source = ${source} AND category = ${category} AND description = ${description} AND status IN ('detected', 'needs_review')
  `
}
