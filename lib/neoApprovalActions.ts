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
// First two entries added 2026-08-20 -- checkVpsProvisioning and
// checkWpProvisioning (app/api/cron/neo-health-check/route.ts) detect a
// stuck order/site and record instanceId/siteId in details_json; these map
// that straight onto the existing, already-manually-used admin assistant
// tools. Both are idempotent (retrying an already-succeeded provision is a
// safe no-op on the underlying routes) and narrow (touch exactly the one
// stuck record), but still propose-and-approve rather than auto-run: a
// provision retry can cost real infra money (a second Hetzner server, a WP
// container) if it somehow ran twice on a false positive, so a human still
// clicks it.
export type NeoApprovalProposal = {
  tool: string // must be a real ADMIN_ASSISTANT_TOOLS function name
  buildArgs: (details: Record<string, unknown>) => Record<string, unknown>
  label: string // shown to the admin in /admin/neo, e.g. "Retry stuck VPS provision"
}

export const NEO_APPROVAL_ACTIONS: Record<string, NeoApprovalProposal> = {
  vps_stuck_provisioning: {
    tool: 'vps_retry_provision',
    buildArgs: (details) => ({ instanceId: details.instanceId }),
    label: 'Retry stuck VPS provision',
  },
  wp_site_stuck_provisioning: {
    tool: 'wp_retry_provision',
    buildArgs: (details) => ({ siteId: details.siteId }),
    label: 'Retry stuck WP site provision',
  },
}

export function hasApprovalAction(category: string): boolean {
  return category in NEO_APPROVAL_ACTIONS
}

export function getApprovalAction(category: string): NeoApprovalProposal | undefined {
  return NEO_APPROVAL_ACTIONS[category]
}
