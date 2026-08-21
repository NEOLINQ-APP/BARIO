import { randomUUID } from 'node:crypto'
import { runAgencyTask } from '@/lib/agentAgency/orchestrate'
import { SPECIALISTS, type Specialist } from '@/lib/agentAgency/types'

// Phase 3 of the multi-agent CRM plan: the actual bridge between agent_tasks
// (the structured task record the spec wants — lead/contact linkage, source/
// target agent, permissions, etc., added to the schema in Phase 1) and
// lib/agentAgency/ (the real Router->Specialist->Critic->Delivery harness,
// built earlier but never wired to anything). Every automatic task (e.g. a
// hot-lead follow-up from lib/leadPipeline.ts) and every manual one (queued
// from /admin/agents) should go through createAgentTask() so the row shape
// stays consistent, and get executed through processAgentTask() so the
// result always lands back on the same row.

const ATLAS_AGENT_ID = 'agent-atlas'

export function isSpecialist(v: unknown): v is Specialist {
  return typeof v === 'string' && (SPECIALISTS as readonly string[]).includes(v)
}

export async function createAgentTask(
  sql: any,
  params: {
    title: string
    objective: string
    targetAgent: Specialist
    sourceAgent?: string
    leadId?: string | null
    contextJson?: string | null
    expectedOutput?: string | null
    agentId?: string
  }
): Promise<string> {
  const id = randomUUID()
  await sql`
    INSERT INTO agent_tasks (id, agent_id, title, description, objective, lead_id, source_agent, target_agent, context_json, expected_output)
    VALUES (
      ${id}, ${params.agentId ?? ATLAS_AGENT_ID}, ${params.title}, ${params.objective},
      ${params.objective}, ${params.leadId ?? null}, ${params.sourceAgent ?? 'atlas'}, ${params.targetAgent},
      ${params.contextJson ?? null}, ${params.expectedOutput ?? null}
    )
  `
  return id
}

// Runs one task through the real agency and writes the reviewed result back
// onto the row. Safe to call more than once on the same task (e.g. a manual
// "Run now" click after the cron already tried) — it just re-runs and
// overwrites result_json with the latest attempt.
export async function processAgentTask(sql: any, taskId: string): Promise<{ ok: boolean; error?: string }> {
  const rows = (await sql`SELECT * FROM agent_tasks WHERE id = ${taskId}`) as unknown as {
    id: string
    title: string
    objective: string | null
    context_json: string | null
    expected_output: string | null
    target_agent: string | null
  }[]
  const task = rows[0]
  if (!task) return { ok: false, error: 'Task not found' }
  if (!task.target_agent) return { ok: false, error: 'Task has no target_agent — nothing to run it through' }

  await sql`UPDATE agent_tasks SET status = 'in_progress', updated_at = now() WHERE id = ${taskId}`

  const parts = [task.objective || task.title]
  if (task.context_json) {
    try {
      const ctx = JSON.parse(task.context_json)
      parts.push(`Context:\n${JSON.stringify(ctx, null, 2)}`)
    } catch {
      // context_json wasn't valid JSON — skip it rather than fail the task over a formatting issue
    }
  }
  if (task.expected_output) parts.push(`Expected output: ${task.expected_output}`)
  const taskText = parts.join('\n\n')

  try {
    const result = await runAgencyTask(taskText)
    await sql`
      UPDATE agent_tasks SET
        status = 'done',
        result_json = ${JSON.stringify({ finalDelivery: result.finalDelivery, revisions: result.revisions, verdict: result.critique.verdict })},
        updated_at = now()
      WHERE id = ${taskId}
    `
    return { ok: true }
  } catch (err: any) {
    await sql`
      UPDATE agent_tasks SET
        status = 'open',
        result_json = ${JSON.stringify({ error: err?.message || 'Agency run failed' })},
        updated_at = now()
      WHERE id = ${taskId}
    `
    return { ok: false, error: err?.message || 'Agency run failed' }
  }
}
