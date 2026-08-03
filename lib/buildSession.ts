import { randomUUID } from 'node:crypto'
import { createSandboxSession, isSandboxSessionAlive } from '@/lib/sandboxHost'

// Shared by the agent route and the direct file-browsing routes so both
// ways of touching a project's sandbox (AI tool calls, manual file-tree
// edits) resolve to the exact same live session — one active dev sandbox
// per project at a time, per the plan's v1 scope.
//
// Real failsafe, not just the happy path: a DB row saying 'running' isn't
// proof the container still exists — it can be gone from under us (manual
// cleanup on the host, a crash, a host restart) with nothing updating the
// row. Every tool call against a dead session used to fail with a raw
// "no such container" error surfaced straight to the user. Now the health
// check runs before reuse, and a dead session is marked 'failed' and
// transparently replaced with a fresh one instead of erroring.
export async function ensureSandboxSession(
  sql: any,
  projectId: string,
  userId: string
): Promise<{ sandboxSessionId: string; previewUrl: string }> {
  const sessionRows = (await sql`
    SELECT * FROM build_sandbox_sessions WHERE project_id = ${projectId} AND status = 'running' ORDER BY created_at DESC LIMIT 1
  `) as unknown as { id: string; preview_url: string }[]

  if (sessionRows.length > 0) {
    const alive = await isSandboxSessionAlive(sessionRows[0].id)
    if (alive) {
      await sql`UPDATE build_sandbox_sessions SET last_active_at = now(), updated_at = now() WHERE id = ${sessionRows[0].id}`
      return { sandboxSessionId: sessionRows[0].id, previewUrl: sessionRows[0].preview_url }
    }
    await sql`UPDATE build_sandbox_sessions SET status = 'failed', last_error = 'Container no longer present on sandbox host', updated_at = now() WHERE id = ${sessionRows[0].id}`
  }

  const sandboxSessionId = randomUUID()
  const created = await createSandboxSession(sandboxSessionId)
  await sql`
    INSERT INTO build_sandbox_sessions (id, project_id, user_id, container_id, status, preview_url, last_active_at, created_at, updated_at)
    VALUES (${sandboxSessionId}, ${projectId}, ${userId}, ${created.containerId}, 'running', ${created.previewUrl}, now(), now(), now())
  `
  return { sandboxSessionId, previewUrl: created.previewUrl }
}
