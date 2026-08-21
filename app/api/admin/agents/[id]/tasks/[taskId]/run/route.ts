import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { processAgentTask } from '@/lib/agentTasks'
import { errorResponse } from '@/lib/errors'

// Admin-triggered immediate execution — the cron (app/api/cron/agent-tasks)
// picks up queued tasks on its own schedule, but waiting up to 15 minutes
// to see a test task run isn't a reasonable ops experience, so this lets
// someone hit "Run now" from /admin/agents and see the real result
// right away. Same processAgentTask() the cron calls — no separate logic.
export const maxDuration = 120

export async function POST(req: Request, { params }: { params: { id: string; taskId: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const result = await processAgentTask(sql, params.taskId)
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
