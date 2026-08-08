import { randomUUID, createHmac } from 'node:crypto'
import type { BoWebhook, BoWebhookEvent } from '@/lib/db'

export const BO_WEBHOOK_EVENTS: BoWebhookEvent[] = [
  'invoice.created',
  'invoice.sent',
  'invoice.paid',
  'customer.created',
  'pos_sale.completed',
  'shift.scheduled',
]

// Fires every active webhook subscribed to this event for this org. Never
// throws and never blocks the real operation on a slow/dead endpoint —
// same "non-fatal, best-effort" posture as every other side-channel
// notification in this app (e.g. signup's verification email). A 5s
// timeout per delivery keeps one broken endpoint from eating meaningful
// serverless execution time.
export async function triggerWebhooks(sql: any, organizationId: string, eventType: BoWebhookEvent, payload: Record<string, unknown>): Promise<void> {
  try {
    const webhooks = (await sql`
      SELECT * FROM bo_webhooks WHERE organization_id = ${organizationId} AND status = 'active'
    `) as unknown as BoWebhook[]

    const targets = webhooks.filter((w) => {
      try {
        return (JSON.parse(w.event_types_json) as string[]).includes(eventType)
      } catch {
        return false
      }
    })

    await Promise.all(targets.map((w) => deliverOne(sql, w, eventType, payload)))
  } catch (err) {
    console.error('triggerWebhooks failed', err)
  }
}

async function deliverOne(sql: any, webhook: BoWebhook, eventType: BoWebhookEvent, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() })
  const signature = createHmac('sha256', webhook.secret).update(body).digest('hex')

  let responseStatus: number | null = null
  let success = false
  let error: string | null = null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bario-Event': eventType, 'X-Bario-Signature': signature },
      body,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    responseStatus = res.status
    success = res.ok
  } catch (err: any) {
    error = err.message ?? 'Delivery failed'
  }

  try {
    await sql`
      INSERT INTO bo_webhook_deliveries (id, webhook_id, event_type, payload_json, response_status, success, error)
      VALUES (${randomUUID()}, ${webhook.id}, ${eventType}, ${body}, ${responseStatus}, ${success}, ${error})
    `
  } catch (err) {
    console.error('Failed to log webhook delivery', err)
  }
}
