// NEO's safe-action registry — the ONLY way a health check is allowed to
// auto-fix something instead of just logging it for a human. This is a
// structural boundary, not a prompt/config toggle: a health check can only
// call recordAutoFix() for a category that has a matching entry here, and
// an entry only gets added after a real incident has been seen, understood,
// and explicitly approved as safe to automate — never spun up ahead of
// time "just in case." Mirrors lib/adminAssistantTools.ts's philosophy
// (destructive/uncertain actions are structurally absent, not just
// discouraged) and admin_actions_log's audit-everything precedent.
//
// Empty on purpose as of 2026-08-18: every health check currently ships in
// detect-only mode (status stays 'needs_review', a human decides). Add an
// entry here only for a fix that is: idempotent (safe to run twice),
// narrow (touches exactly the broken thing, nothing else), and reversible
// or side-effect-free. Ask before adding anything that changes customer
// data, billing, or deploys code — those stay human-approved regardless of
// how "obviously safe" a specific case looks.
export const NEO_SAFE_ACTIONS: Record<string, (sql: any, details: Record<string, unknown>) => Promise<string>> = {
  // 'wp_hosting_node_unreachable': async (sql, details) => { ... }
}

export function hasSafeAction(category: string): boolean {
  return category in NEO_SAFE_ACTIONS
}

export async function runSafeAction(sql: any, category: string, details: Record<string, unknown>): Promise<string> {
  const action = NEO_SAFE_ACTIONS[category]
  if (!action) throw new Error(`No registered safe action for category: ${category}`)
  return action(sql, details)
}
