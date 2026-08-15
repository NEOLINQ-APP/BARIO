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
//
// Also guards against a real race hit live 2026-08-15: BuildEditor.tsx
// fires an on-mount call to warm up the preview session at the same time
// the first chat message fires its own call, both landing here with no
// existing row yet. Without coordination, both independently created a
// full sandbox container — two real containers for one project — and the
// browser ended up displaying whichever one's URL happened to resolve
// last, which was a coin flip against the one the AI actually wrote files
// into (that one just sat there empty, showing Bad Gateway forever).
// build_sandbox_sessions_active_project_idx (lib/db.ts) makes "claim the
// right to create this project's session" an atomic DB operation: only one
// concurrent caller's INSERT can land, so the loser waits for the winner's
// row instead of standing up a second container.
export async function ensureSandboxSession(
  sql: any,
  projectId: string,
  userId: string
): Promise<{ sandboxSessionId: string; previewUrl: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const sessionRows = (await sql`
      SELECT id, status, preview_url FROM build_sandbox_sessions
      WHERE project_id = ${projectId} AND status IN ('starting', 'running')
      ORDER BY created_at DESC LIMIT 1
    `) as unknown as { id: string; status: string; preview_url: string | null }[]

    if (sessionRows.length > 0) {
      const row = sessionRows[0]

      if (row.status === 'starting') {
        // Someone else (this same race) is creating this project's session
        // right now — wait for their row to finish instead of racing a
        // second container into existence.
        const ready = await waitForSessionReady(sql, row.id)
        if (ready) return ready
        continue // their creation failed; loop back and try to claim it ourselves
      }

      const alive = await isSandboxSessionAlive(row.id)
      if (alive) {
        await sql`UPDATE build_sandbox_sessions SET last_active_at = now(), updated_at = now() WHERE id = ${row.id}`
        return { sandboxSessionId: row.id, previewUrl: row.preview_url! }
      }
      await sql`UPDATE build_sandbox_sessions SET status = 'failed', last_error = 'Container no longer present on sandbox host', updated_at = now() WHERE id = ${row.id}`
      continue
    }

    // Atomically claim the right to create this project's session. If a
    // concurrent caller's INSERT already landed between our SELECT above
    // and this INSERT, the partial unique index rejects ours (0 rows
    // returned) instead of us both proceeding to create real containers.
    const sandboxSessionId = randomUUID()
    const claimed = (await sql`
      INSERT INTO build_sandbox_sessions (id, project_id, user_id, status, created_at, updated_at)
      VALUES (${sandboxSessionId}, ${projectId}, ${userId}, 'starting', now(), now())
      ON CONFLICT (project_id) WHERE status IN ('starting', 'running') DO NOTHING
      RETURNING id
    `) as unknown as { id: string }[]

    if (claimed.length === 0) continue // lost the race — loop back and wait for the winner's row

    try {
      const created = await createSandboxSession(sandboxSessionId)
      await sql`
        UPDATE build_sandbox_sessions
        SET status = 'running', container_id = ${created.containerId}, preview_url = ${created.previewUrl},
            last_active_at = now(), updated_at = now()
        WHERE id = ${sandboxSessionId}
      `
      return { sandboxSessionId, previewUrl: created.previewUrl }
    } catch (err: any) {
      await sql`UPDATE build_sandbox_sessions SET status = 'failed', last_error = ${String(err?.message ?? err)}, updated_at = now() WHERE id = ${sandboxSessionId}`
      throw err
    }
  }
  throw new Error('Could not establish a sandbox session (too much contention)')
}

// Polls a 'starting' row (created by a concurrent ensureSandboxSession call
// that's still creating the actual container) until it flips to 'running'
// with a preview URL, or 'failed'. Bounded at ~8s — real container creation
// on this host takes low single-digit seconds.
async function waitForSessionReady(
  sql: any,
  sessionId: string
): Promise<{ sandboxSessionId: string; previewUrl: string } | null> {
  for (let i = 0; i < 20; i++) {
    const rows = (await sql`
      SELECT status, preview_url FROM build_sandbox_sessions WHERE id = ${sessionId}
    `) as unknown as { status: string; preview_url: string | null }[]
    const row = rows[0]
    if (!row || row.status === 'failed') return null
    if (row.status === 'running' && row.preview_url) return { sandboxSessionId: sessionId, previewUrl: row.preview_url }
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}
