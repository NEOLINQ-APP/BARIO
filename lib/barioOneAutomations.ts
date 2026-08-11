import { randomUUID } from 'node:crypto'
import type { BoAutomation, BoAutomationActionType, BoAutomationTrigger } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { sendSms } from '@/lib/twilio'

export const AUTOMATION_TRIGGERS: BoAutomationTrigger[] = ['deal.created', 'deal.stage_changed', 'customer.created', 'invoice.paid']
export const AUTOMATION_ACTIONS: BoAutomationActionType[] = ['create_task', 'add_tag', 'add_note', 'send_email', 'send_sms']

type AutomationContext = {
  customerId?: string
  dealId?: string
  pipelineId?: string
  stage?: string
  invoiceId?: string
}

// Fired alongside (never instead of) the existing outbound webhooks at each
// event source — same non-blocking, never-throws contract as
// triggerWebhooks, so a misconfigured automation can never break the
// primary operation that triggered it.
export async function runAutomations(sql: any, organizationId: string, trigger: BoAutomationTrigger, context: AutomationContext): Promise<void> {
  try {
    const rules = (await sql`
      SELECT * FROM bo_automations WHERE organization_id = ${organizationId} AND trigger_event = ${trigger} AND status = 'active'
    `) as unknown as BoAutomation[]

    for (const rule of rules) {
      if (!matchesFilter(rule, context)) continue
      await executeOne(sql, organizationId, rule, context)
    }
  } catch (err) {
    console.error('runAutomations failed', err)
  }
}

function matchesFilter(rule: BoAutomation, context: AutomationContext): boolean {
  let filter: Record<string, unknown>
  try {
    filter = JSON.parse(rule.trigger_filter_json || '{}')
  } catch {
    return true
  }
  if (typeof filter.stageKey === 'string' && filter.stageKey !== context.stage) return false
  if (typeof filter.pipelineId === 'string' && filter.pipelineId !== context.pipelineId) return false
  return true
}

async function executeOne(sql: any, organizationId: string, rule: BoAutomation, context: AutomationContext): Promise<void> {
  let success = true
  let error: string | null = null
  try {
    const config = JSON.parse(rule.action_config_json || '{}') as Record<string, unknown>
    switch (rule.action_type) {
      case 'create_task': {
        const title = typeof config.title === 'string' ? config.title.trim() : ''
        if (!title) throw new Error('This automation has no task title configured')
        const dueInDays = Number(config.dueInDays)
        const dueAt = Number.isFinite(dueInDays) && dueInDays > 0 ? new Date(Date.now() + dueInDays * 86400000) : null
        await sql`
          INSERT INTO bo_tasks (id, organization_id, customer_id, deal_id, title, due_at, status)
          VALUES (${randomUUID()}, ${organizationId}, ${context.customerId ?? null}, ${context.dealId ?? null}, ${title}, ${dueAt}, 'open')
        `
        break
      }
      case 'add_tag': {
        const tag = typeof config.tag === 'string' ? config.tag.trim() : ''
        if (!context.customerId || !tag) throw new Error('Missing customer or tag')
        const rows = (await sql`SELECT tags_json FROM bo_customers WHERE id = ${context.customerId} AND organization_id = ${organizationId}`) as unknown as { tags_json: string }[]
        if (!rows[0]) throw new Error('Customer not found')
        const tags: string[] = JSON.parse(rows[0].tags_json || '[]')
        if (!tags.includes(tag)) {
          tags.push(tag)
          await sql`UPDATE bo_customers SET tags_json = ${JSON.stringify(tags)}, updated_at = now() WHERE id = ${context.customerId}`
        }
        break
      }
      case 'add_note': {
        const body = typeof config.body === 'string' ? config.body.trim() : ''
        if (!context.customerId || !body) throw new Error('Missing customer or note body')
        await sql`
          INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
          VALUES (${randomUUID()}, ${organizationId}, ${context.customerId}, 'note', ${body})
        `
        break
      }
      case 'send_email': {
        if (!context.customerId) throw new Error('No customer in context')
        const subject = typeof config.subject === 'string' ? config.subject.trim() : ''
        const body = typeof config.body === 'string' ? config.body.trim() : ''
        if (!subject || !body) throw new Error('Missing subject or body')
        const rows = (await sql`SELECT email FROM bo_customers WHERE id = ${context.customerId} AND organization_id = ${organizationId}`) as unknown as { email: string | null }[]
        if (!rows[0]?.email) throw new Error('Customer has no email on file')
        await sendEmail(rows[0].email, subject, body.replace(/\n/g, '<br/>'))
        await sql`
          INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
          VALUES (${randomUUID()}, ${organizationId}, ${context.customerId}, 'email', ${`Subject: ${subject}\n\n${body}`})
        `
        break
      }
      case 'send_sms': {
        if (!context.customerId) throw new Error('No customer in context')
        const body = typeof config.body === 'string' ? config.body.trim() : ''
        if (!body) throw new Error('Missing message body')
        const rows = (await sql`SELECT phone FROM bo_customers WHERE id = ${context.customerId} AND organization_id = ${organizationId}`) as unknown as { phone: string | null }[]
        if (!rows[0]?.phone) throw new Error('Customer has no phone number on file')
        await sendSms(rows[0].phone, body)
        await sql`
          INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
          VALUES (${randomUUID()}, ${organizationId}, ${context.customerId}, 'sms', ${body})
        `
        break
      }
      default:
        throw new Error(`Unknown action type: ${rule.action_type}`)
    }
  } catch (err: any) {
    success = false
    error = err.message ?? 'Automation failed'
  }
  try {
    await sql`
      INSERT INTO bo_automation_runs (id, automation_id, context_json, success, error)
      VALUES (${randomUUID()}, ${rule.id}, ${JSON.stringify(context)}, ${success}, ${error})
    `
  } catch (err) {
    console.error('Failed to log automation run', err)
  }
}
