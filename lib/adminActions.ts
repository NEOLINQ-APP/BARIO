import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'

// Shared audit-log writer for every admin/autonomous action (grant plan,
// verify email, import content, provision a VPS, CRM outreach sends, etc.)
// — one row per action in admin_actions_log, regardless of whether it was
// triggered by a human admin, the Bearer-key path, or an autonomous cron/AI
// flow (triggeredBy distinguishes those).
export async function logAdminAction(
  sql: Awaited<ReturnType<typeof db>>,
  action: {
    action: string
    targetEmail?: string
    params?: Record<string, unknown>
    result: string
    triggeredBy: string
  }
): Promise<void> {
  await sql`
    INSERT INTO admin_actions_log (id, action, target_email, params_json, result, triggered_by)
    VALUES (${randomUUID()}, ${action.action}, ${action.targetEmail ?? null}, ${JSON.stringify(action.params ?? {})}, ${action.result}, ${action.triggeredBy})
  `
}
