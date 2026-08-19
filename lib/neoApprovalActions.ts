// NEO's approval-gated action registry — the counterpart to
// lib/neoActions.ts's safe-action registry, for a fix NEO knows how to run
// but that isn't safe to fire blind on a timer. A category with an entry
// here gets PROPOSED (incident flips to 'pending_approval' with the exact
// tool+args, admin gets an SMS) instead of run automatically — execution
// only happens if the admin explicitly clicks Approve in /admin/neo (see
// app/api/admin/neo/incidents/[id]/approve). Same structural-boundary
// philosophy as the safe-action registry and lib/adminAssistantTools.ts:
// a category can only reach 'pending_approval' if it has a matching entry
// here, and the entry only calls into ADMIN_ASSISTANT_TOOLS' own tool
// names/args shape (see executeAdminAssistantTool) — no separate remediation
// logic invented just for NEO.
//
// Empty on purpose as of 2026-08-19: none of NEO's current health checks
// (endpoint_down, wp_hosting_node_unhealthy, stripe_unreachable,
// sentry_not_configured) map cleanly to one of the admin assistant's
// account-management tools — they're infra-level signals, not "this one
// customer's record got stuck" issues. Add an entry only once a real
// incident has occurred, the right fix is understood, and it's been
// explicitly reviewed as reasonable to *propose* (never skip straight to
// the safe-action registry just because it has an entry here — proposing
// and auto-running are different trust levels on purpose).
export type NeoApprovalProposal = {
  tool: string // must be a real ADMIN_ASSISTANT_TOOLS function name
  buildArgs: (details: Record<string, unknown>) => Record<string, unknown>
  label: string // shown to the admin in /admin/neo, e.g. "Retry stuck VPS provision"
}

export const NEO_APPROVAL_ACTIONS: Record<string, NeoApprovalProposal> = {
  // 'vps_stuck_provisioning': {
  //   tool: 'vps_retry_provision',
  //   buildArgs: (details) => ({ vpsId: details.vpsId }),
  //   label: 'Retry stuck VPS provision',
  // },
}

export function hasApprovalAction(category: string): boolean {
  return category in NEO_APPROVAL_ACTIONS
}

export function getApprovalAction(category: string): NeoApprovalProposal | undefined {
  return NEO_APPROVAL_ACTIONS[category]
}
