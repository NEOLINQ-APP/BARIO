import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import type { CodingTaskRequest } from '@/lib/db'

// Polled by the "Victoria Coding Dispatcher" routine (a real Claude Code
// cloud session, created via the remote-trigger API — see
// C:\Users\surew\.claude\plans\eventual-wandering-backus.md) once an hour to
// pick up coding tasks Victoria queued via queue_coding_task
// (lib/victoriaAppTools.ts). Bearer-only (BARIO_ADMIN_API_KEY) — this is
// server-to-server, no human ever hits it from a browser.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const tasks = (await sql`
      SELECT id, task, created_at FROM coding_task_requests
      WHERE status = 'pending' ORDER BY created_at ASC
    `) as unknown as Pick<CodingTaskRequest, 'id' | 'task' | 'created_at'>[]
    return NextResponse.json({ ok: true, tasks })
  } catch (err) {
    return errorResponse(err)
  }
}
