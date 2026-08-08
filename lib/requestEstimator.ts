import { randomUUID } from 'node:crypto'
import { getOpenAI } from '@/lib/openai'
import { estimateCompletion } from '@/lib/businessHours'

export type ClientRequestRow = {
  id: string
  company_key: string
  title: string
  description: string
  status: string
  priority: number
  estimated_hours: number | null
  created_at: string
}

const COMPANY_LABELS: Record<string, string> = {
  afc_logistics: 'AFC Logistics',
  sunbuilt_group: 'Sunbuilt Group',
}

async function logEvent(sql: any, requestId: string, actor: string, actorLabel: string, eventType: string, message: string | null) {
  await sql`
    INSERT INTO client_request_events (id, request_id, actor, actor_label, event_type, message)
    VALUES (${randomUUID()}, ${requestId}, ${actor}, ${actorLabel}, ${eventType}, ${message})
  `
}

// Queue-ordered list of open requests across BOTH companies — the estimate
// is only ever weighed against this shared backlog, never BARIO's own
// unrelated engineering work.
async function getOpenQueue(sql: any): Promise<ClientRequestRow[]> {
  return (await sql`
    SELECT id, company_key, title, description, status, priority, estimated_hours, created_at
    FROM client_requests
    WHERE status IN ('new', 'in_progress', 'blocked')
    ORDER BY priority ASC, created_at ASC
  `) as unknown as ClientRequestRow[]
}

async function estimateHours(request: { title: string; description: string }, queue: ClientRequestRow[]): Promise<{ hours: number; reasoning: string }> {
  const openai = getOpenAI()
  const queueSummary = queue.length
    ? queue.map((q, i) => `${i + 1}. [${COMPANY_LABELS[q.company_key] ?? q.company_key}] ${q.title} (~${q.estimated_hours ?? '?'}h, status: ${q.status})`).join('\n')
    : '(nothing else currently open)'

  const completion = await openai.chat.completions.create({
    model: 'gpt-5.6-luna',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You estimate realistic effort in working hours for software/ops tasks requested by two small business clients (AFC Logistics, a freight logistics company, and Sunbuilt Group, a construction/renovation company) of a one-person dev shop (Unique Group Inc.). Be honest and realistic — a small copy change is under 1 hour, a new integrated feature can be 4-20+ hours, a large system is 20+ hours. Respond with ONLY a JSON object: {"hours": <number>, "reasoning": "<one or two sentence honest explanation of the estimate, written for the client>"}.',
      },
      {
        role: 'user',
        content: `New request:\nTitle: ${request.title}\nDescription: ${request.description}\n\nOther currently open work already ahead in the queue:\n${queueSummary}\n\nEstimate ONLY the hours for the new request above (not the queue).`,
      },
    ],
    max_completion_tokens: 300,
  })

  const raw = completion.choices[0]?.message?.content?.trim() || '{}'
  let parsed: { hours?: unknown; reasoning?: unknown } = {}
  try {
    parsed = JSON.parse(raw)
  } catch {
    // fall through to the default below
  }
  const hours = typeof parsed.hours === 'number' && parsed.hours > 0 ? parsed.hours : 2
  const reasoning = typeof parsed.reasoning === 'string' && parsed.reasoning ? parsed.reasoning : 'Estimate based on task description.'
  return { hours, reasoning }
}

/**
 * Estimates a single request against the current shared open queue (which
 * should already exclude `request.id` itself if it's already inserted), and
 * writes estimated_hours / estimated_completion_at / estimate_reasoning.
 * Logs an 'estimate' event.
 */
export async function estimateRequest(sql: any, requestId: string): Promise<void> {
  const rows = (await sql`SELECT id, company_key, title, description, status, priority, estimated_hours, created_at FROM client_requests WHERE id = ${requestId}`) as unknown as ClientRequestRow[]
  const request = rows[0]
  if (!request) return

  const fullQueue = await getOpenQueue(sql)
  const queueAhead = fullQueue.filter((q) => q.id !== requestId && (q.priority < request.priority || (q.priority === request.priority && q.created_at < request.created_at)))
  const hoursAhead = queueAhead.reduce((sum, q) => sum + (q.estimated_hours ?? 2), 0)

  const { hours, reasoning } = await estimateHours(request, queueAhead)
  const completionAt = estimateCompletion(hoursAhead, hours)

  await sql`
    UPDATE client_requests
    SET estimated_hours = ${hours}, estimated_completion_at = ${completionAt.toISOString()}, estimate_reasoning = ${reasoning}, updated_at = now()
    WHERE id = ${requestId}
  `
  await logEvent(sql, requestId, 'ai', 'AI estimator', 'estimate', `Estimated ${hours}h — ${reasoning}`)
}

/**
 * Re-runs estimateRequest for every other open request in the shared queue —
 * called after a status/priority change shifts the queue order so every
 * client's ETA stays honest.
 */
export async function reestimateOpenQueue(sql: any, excludeRequestId?: string): Promise<void> {
  const queue = await getOpenQueue(sql)
  for (const req of queue) {
    if (req.id === excludeRequestId) continue
    await estimateRequest(sql, req.id)
  }
}
