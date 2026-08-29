import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { getOpenAI } from '@/lib/openai'

// Miko -- the business-operations agent (CRM/leads/follow-ups), completing
// the core Miko/Sky/NEO team. Miko never sends a real customer an email
// unsupervised -- she drafts, a human reviews and approves the send. Same
// DRAFT-not-SENT discipline as Victoria's request_website_fix, and the same
// caution this codebase already applied once before: lib/crmOutreach.ts was
// disabled outright in 2026-08-20 rather than left auto-sending against a
// dead CRM, because customer-facing sends without review are a real,
// previously-considered risk here.

type Candidate = {
  id: string
  contact_name: string | null
  company_name: string | null
  email: string | null
  last_activity_at: string | null
}

export async function reviewAndDraftFollowUps(organizationId: string, limit = 10) {
  const sql = await db()

  const orgRows = (await sql`SELECT name FROM bo_organizations WHERE id = ${organizationId}`) as unknown as { name: string }[]
  const orgName = orgRows[0]?.name
  if (!orgName) throw new Error('Organization not found')

  // Candidates: contactable (has email, not opted out), ordered so the
  // longest-neglected (or never-contacted) customers are considered first.
  const candidates = (await sql`
    SELECT c.id, c.contact_name, c.company_name, c.email,
      (SELECT max(n.created_at) FROM bo_notes n WHERE n.customer_id = c.id) AS last_activity_at
    FROM bo_customers c
    WHERE c.organization_id = ${organizationId}
      AND c.do_not_contact = false
      AND c.email IS NOT NULL
    ORDER BY last_activity_at ASC NULLS FIRST
    LIMIT ${limit * 3}
  `) as unknown as Candidate[]

  const FOLLOW_UP_AFTER_DAYS = 14
  const needsFollowUp = candidates
    .filter((c) => {
      if (!c.last_activity_at) return true
      const daysSince = (Date.now() - new Date(c.last_activity_at).getTime()) / 86_400_000
      return daysSince >= FOLLOW_UP_AFTER_DAYS
    })
    .slice(0, limit)

  const drafted: { id: string; customerName: string; reason: string }[] = []

  for (const customer of needsFollowUp) {
    // Don't pile up duplicate drafts for the same customer across runs.
    const existing = await sql`SELECT id FROM miko_followup_drafts WHERE customer_id = ${customer.id} AND status = 'draft'`
    if ((existing as unknown[]).length > 0) continue

    const customerName = customer.contact_name || customer.company_name || 'there'
    const reason = customer.last_activity_at
      ? `No activity logged in ${Math.floor((Date.now() - new Date(customer.last_activity_at).getTime()) / 86_400_000)} days`
      : 'Never contacted since being added to the CRM'

    let generated: { subject: string; bodyHtml: string }
    try {
      generated = await generateFollowUp({ orgName, customerName, reason })
    } catch (err) {
      console.error('miko: generateFollowUp failed for', customer.id, err)
      continue
    }

    const id = randomUUID()
    await sql`
      INSERT INTO miko_followup_drafts (id, organization_id, customer_id, customer_name, customer_email, reason, subject, body_html)
      VALUES (${id}, ${organizationId}, ${customer.id}, ${customerName}, ${customer.email}, ${reason}, ${generated.subject}, ${generated.bodyHtml})
    `
    drafted.push({ id, customerName, reason })
  }

  return { orgName, reviewed: needsFollowUp.length, drafted: drafted.length, drafts: drafted }
}

async function generateFollowUp(input: { orgName: string; customerName: string; reason: string }): Promise<{ subject: string; bodyHtml: string }> {
  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-5.6-luna',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are Miko, a business-operations assistant drafting a short, warm follow-up email on behalf of a real small business to one of their real leads/customers. Write 3-4 genuine, non-salesy sentences checking in — never invent specifics you were not given (no fake order numbers, no fake references to a prior conversation, no fake promises or discounts). Sign off naturally as "The {company} team." Respond with ONLY a JSON object: {"subject": "<short email subject>", "bodyHtml": "<p>...</p><p>...</p>"}.',
      },
      {
        role: 'user',
        content: `Company: ${input.orgName}\nLead/customer name: ${input.customerName}\nReason for following up: ${input.reason}\n\nDraft the follow-up email now.`,
      },
    ],
    max_completion_tokens: 400,
  })

  const raw = completion.choices[0]?.message?.content?.trim() || '{}'
  const parsed = JSON.parse(raw) as { subject?: unknown; bodyHtml?: unknown }
  if (typeof parsed.subject !== 'string' || typeof parsed.bodyHtml !== 'string') {
    throw new Error('Miko: model did not return the expected {subject, bodyHtml} shape')
  }
  return { subject: parsed.subject, bodyHtml: parsed.bodyHtml }
}
