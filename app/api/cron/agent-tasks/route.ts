import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { processAgentTask } from '@/lib/agentTasks'

// Same dual-auth shape as every other cron in this project. Picks up any
// agent_tasks row that has a target_agent (i.e. was actually meant to run
// through the agency, not just a plain manual to-do) and hasn't produced a
// result yet, and runs it through lib/agentTasks.ts's processAgentTask().
// Capped at 2 per invocation — each run through the full Router->
// Specialist->Critic->Delivery chain can take up to a minute or two, and
// this fires every 15 minutes, so the backlog clears fast without risking
// the function's own time limit.
export const maxDuration = 280
const BATCH_SIZE = 2

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()
  const pending = (await sql`
    SELECT id FROM agent_tasks
    WHERE target_agent IS NOT NULL AND result_json IS NULL AND status != 'in_progress'
    ORDER BY created_at ASC
    LIMIT ${BATCH_SIZE}
  `) as unknown as { id: string }[]

  const results: { id: string; ok: boolean; error?: string }[] = []
  for (const task of pending) {
    const result = await processAgentTask(sql, task.id)
    results.push({ id: task.id, ...result })
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
