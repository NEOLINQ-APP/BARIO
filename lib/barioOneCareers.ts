import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { BARIO_MASTER_ORG_ID } from '@/lib/barioOneAssistantTools'
import { getCrmMailboxCreds, sendViaCrmMailbox } from '@/lib/barioOneCrmMailbox'
import { sendEmail } from '@/lib/email'

// Real job applications from /careers, landing as CRM records in Bario's
// own master org (tagged 'job-applicant', kept separate from sales leads
// which are tagged 'lead') so they're browsable/reply-able from the same
// admin panel (/admin/bario-one-leads) that already handles leads --
// same bo_customers/bo_notes shape, just a different tag, no new table.
export type CareersApplication = {
  name: string
  email: string
  phone: string | null
  roleInterest: string | null
  message: string
  resumeLink: string | null
}

async function draftAcknowledgment(app: CareersApplication): Promise<{ subject: string; body: string }> {
  const fallback = {
    subject: 'Thanks for your interest in Bario',
    body: `Hi ${app.name.split(' ')[0]},\n\nThanks for reaching out about joining the Bario team. We review every application -- if there's a fit with something we're hiring for now or soon, we'll be in touch.\n\nBest,\nThe Bario team`,
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fallback

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      system:
        'You write a short, warm acknowledgment email replying to someone who just applied to join a small tech company (Bario) via its careers page. Thank them, briefly reference what they said if relevant, and set honest expectations: applications are reviewed, and they\'ll hear back if there\'s a fit with a current or upcoming role -- never promise an interview or a timeline. Sign off as "The Bario team". Respond with ONLY raw JSON, no markdown fences: {"subject": string, "body": string}. body uses \\n for line breaks, no HTML.',
      messages: [
        {
          role: 'user',
          content: `Applicant name: ${app.name}\nRole interest: ${app.roleInterest || 'not specified'}\nTheir message: ${app.message}`,
        },
      ],
    })
    const textBlock = response.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n')
    const jsonMatch = textBlock.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return fallback
    const parsed = JSON.parse(jsonMatch[0])
    if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') return fallback
    return { subject: parsed.subject, body: parsed.body }
  } catch (err) {
    console.error('draftAcknowledgment failed, using fallback', err)
    return fallback
  }
}

export async function submitCareersApplication(app: CareersApplication): Promise<{ customerId: string }> {
  const sql = await db()
  const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${BARIO_MASTER_ORG_ID}`) as unknown as any[]
  const org = orgRows[0]

  const existing = (await sql`
    SELECT id FROM bo_customers
    WHERE organization_id = ${BARIO_MASTER_ORG_ID} AND lower(email) = ${app.email.toLowerCase()} AND tags_json LIKE '%"job-applicant"%'
    LIMIT 1
  `) as unknown as { id: string }[]

  let customerId: string
  if (existing[0]) {
    customerId = existing[0].id
  } else {
    customerId = randomUUID()
    await sql`
      INSERT INTO bo_customers (id, organization_id, contact_name, email, phone, tags_json)
      VALUES (${customerId}, ${BARIO_MASTER_ORG_ID}, ${app.name}, ${app.email.toLowerCase()}, ${app.phone}, '["job-applicant"]')
    `
  }

  const applicationBody = [
    `New job application via /careers`,
    app.roleInterest ? `Role interest: ${app.roleInterest}` : null,
    app.resumeLink ? `Resume/portfolio: ${app.resumeLink}` : null,
    `Message:\n${app.message}`,
  ].filter(Boolean).join('\n')
  await sql`
    INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
    VALUES (${randomUUID()}, ${BARIO_MASTER_ORG_ID}, ${customerId}, 'note', ${applicationBody})
  `

  // Real acknowledgment reply, sent from the master org's own CRM mailbox
  // so it lands in the same two-way thread an admin can continue from
  // /admin/bario-one-leads -- same send path 1:1 CRM email already uses.
  const ack = await draftAcknowledgment(app)
  const creds = org ? getCrmMailboxCreds(org) : null
  let messageId: string | null = null
  try {
    if (creds) {
      const result = await sendViaCrmMailbox(creds, { to: app.email, subject: ack.subject, html: ack.body.replace(/\n/g, '<br/>') })
      messageId = result.messageId
    } else {
      await sendEmail(app.email, ack.subject, ack.body.replace(/\n/g, '<br/>'))
    }
    await sql`
      INSERT INTO bo_notes (id, organization_id, customer_id, kind, body, direction, from_email, message_id)
      VALUES (${randomUUID()}, ${BARIO_MASTER_ORG_ID}, ${customerId}, 'email', ${`Subject: ${ack.subject}\n\n${ack.body}`}, 'outbound', ${creds?.email ?? null}, ${messageId})
    `
  } catch (err) {
    console.error('Failed to send careers acknowledgment email', err)
  }

  // Internal notification so a real application never just sits unseen in
  // the CRM -- always sent regardless of whether the acknowledgment above
  // succeeded.
  try {
    await sendEmail(
      'admin@bario.ca',
      `New job application: ${app.name}`,
      `${applicationBody.replace(/\n/g, '<br/>')}<br/><br/>Applicant email: ${app.email}${app.phone ? `<br/>Phone: ${app.phone}` : ''}<br/><br/>View in CRM: https://www.bario.ca/admin/bario-one-leads`
    )
  } catch (err) {
    console.error('Failed to send careers admin notification', err)
  }

  return { customerId }
}
