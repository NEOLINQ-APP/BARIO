import { randomUUID } from 'node:crypto'

// Every admin-tool execution (whether clicked by the admin or called by the
// admin AI assistant's tool-calling) writes one row here — the audit trail
// the user explicitly asked for so autonomous actions stay reviewable after
// the fact even though they don't ask permission first.
export async function logAdminAction(
  sql: any,
  opts: {
    action: string
    targetEmail?: string | null
    params?: Record<string, unknown>
    result: 'ok' | 'error'
    triggeredBy?: 'admin' | 'ai_autonomous'
  }
): Promise<void> {
  await sql`
    INSERT INTO admin_actions_log (id, action, target_email, params_json, result, triggered_by)
    VALUES (
      ${randomUUID()},
      ${opts.action},
      ${opts.targetEmail ?? null},
      ${JSON.stringify(opts.params ?? {})},
      ${opts.result},
      ${opts.triggeredBy ?? 'admin'}
    )
  `
}
