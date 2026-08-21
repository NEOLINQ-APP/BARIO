import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { BoOrganization, BoEmailCampaign } from '@/lib/db'
import { getCrmMailboxCreds, sendViaCrmMailbox } from '@/lib/barioOneCrmMailbox'
import { sendEmail } from '@/lib/email'
import { getOrCreateUnsubscribeToken } from '@/lib/barioOneSuppression'

// Shared by the admin bulk-send UI and Miko's send_email_campaign tool —
// same send path the existing 1:1 customer email route uses (CRM mailbox
// if the org has one provisioned, else Bario's shared Resend identity),
// just looped over every customer with an email on file instead of one.
// Each successful send is logged to bo_notes exactly like a 1:1 send, with
// campaign_id set, so a lead's own history and the campaign's own history
// are the same rows viewed two ways -- no separate recipients table.
export async function createCampaign(
  sql: any,
  org: BoOrganization,
  opts: { name: string; subject: string; body: string; scheduledAt: Date | null; personalize: boolean; createdByUserId: string | null; createdVia: 'admin' | 'ai_assistant' }
): Promise<BoEmailCampaign> {
  const id = randomUUID()
  const bodyHtml = opts.body.trim().replace(/\n/g, '<br/>')
  const isScheduledForLater = opts.scheduledAt !== null && opts.scheduledAt.getTime() > Date.now()
  const status = isScheduledForLater ? 'scheduled' : 'draft'

  await sql`
    INSERT INTO bo_email_campaigns (id, organization_id, name, subject, body_html, status, scheduled_at, personalize, created_by_user_id, created_via)
    VALUES (${id}, ${org.id}, ${opts.name}, ${opts.subject}, ${bodyHtml}, ${status}, ${isScheduledForLater ? opts.scheduledAt : null}, ${opts.personalize}, ${opts.createdByUserId}, ${opts.createdVia})
  `
  const rows = (await sql`SELECT * FROM bo_email_campaigns WHERE id = ${id}`) as unknown as BoEmailCampaign[]
  const campaign = rows[0]

  if (status === 'draft') {
    return await sendCampaignNow(sql, org, campaign)
  }
  return campaign
}

// Rewrites the campaign's template into a one-off email for this specific
// recipient — referencing their company/contact name and adapting tone,
// while keeping the same core offer/ask the template describes. Falls back
// to the literal template (never throws) so one bad AI call can't stall an
// entire campaign send.
async function personalizeForRecipient(
  subjectTemplate: string,
  bodyTemplate: string,
  recipient: { contactName: string; companyName: string | null }
): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { subject: subjectTemplate, body: bodyTemplate }

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      system:
        'You personalize one cold-outreach email for one specific recipient, given a template. Keep the same core offer/ask and roughly the same length as the template. Reference the recipient\'s company/name naturally, once or twice — do not force it into every sentence. Never invent facts not in the template. Respond with ONLY raw JSON, no markdown fences: {"subject": string, "body": string}. body uses \\n for line breaks, no HTML.',
      messages: [
        {
          role: 'user',
          content: `Template subject: ${subjectTemplate}\n\nTemplate body:\n${bodyTemplate}\n\nRecipient: ${recipient.contactName}${recipient.companyName ? ` at ${recipient.companyName}` : ''}`,
        },
      ],
    })
    const textBlock = response.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n')
    const jsonMatch = textBlock.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { subject: subjectTemplate, body: bodyTemplate }
    const parsed = JSON.parse(jsonMatch[0])
    if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') return { subject: subjectTemplate, body: bodyTemplate }
    return { subject: parsed.subject, body: parsed.body }
  } catch (err) {
    console.error('personalizeForRecipient failed, falling back to template', err)
    return { subject: subjectTemplate, body: bodyTemplate }
  }
}

export async function sendCampaignNow(sql: any, org: BoOrganization, campaign: BoEmailCampaign): Promise<BoEmailCampaign> {
  await sql`UPDATE bo_email_campaigns SET status = 'sending', updated_at = now() WHERE id = ${campaign.id}`

  // Suppression hardening (Phase 7): a bulk campaign is exactly the send
  // path CASL/CAN-SPAM opt-out enforcement matters most for — never send
  // to a customer who's asked not to be contacted.
  const recipients = (await sql`
    SELECT id, email, contact_name, company_name FROM bo_customers
    WHERE organization_id = ${org.id} AND email IS NOT NULL AND email <> '' AND do_not_contact IS NOT TRUE
  `) as unknown as { id: string; email: string; contact_name: string; company_name: string | null }[]

  const creds = getCrmMailboxCreds(org)
  // Plain-text version of the template for the AI to rewrite from — the
  // stored body_html already has <br/> in place of newlines.
  const plainTemplate = campaign.body_html.replace(/<br\s*\/?>/gi, '\n')
  let sentCount = 0
  let failedCount = 0

  for (const recipient of recipients) {
    try {
      let subject = campaign.subject
      let html = campaign.body_html
      if (campaign.personalize) {
        const personalized = await personalizeForRecipient(campaign.subject, plainTemplate, {
          contactName: recipient.contact_name,
          companyName: recipient.company_name,
        })
        subject = personalized.subject
        html = personalized.body.trim().replace(/\n/g, '<br/>')
      }

      const unsubToken = await getOrCreateUnsubscribeToken(sql, recipient.id)
      const htmlWithFooter = `${html}<br/><br/><p style="color:#94a3b8;font-size:11px;">Don't want these emails? <a href="https://www.bario.ca/api/bario-one/unsubscribe?token=${unsubToken}">Unsubscribe</a></p>`

      let messageId: string | null = null
      if (creds) {
        const result = await sendViaCrmMailbox(creds, { to: recipient.email, subject, html: htmlWithFooter })
        messageId = result.messageId
      } else {
        await sendEmail(recipient.email, subject, htmlWithFooter)
      }
      await sql`
        INSERT INTO bo_notes (id, organization_id, customer_id, kind, body, direction, from_email, message_id, campaign_id)
        VALUES (${randomUUID()}, ${org.id}, ${recipient.id}, 'email', ${`Subject: ${subject}\n\n${html}`}, 'outbound', ${creds?.email ?? null}, ${messageId}, ${campaign.id})
      `
      sentCount++
    } catch (err) {
      console.error(`Campaign ${campaign.id} failed to send to ${recipient.email}`, err)
      failedCount++
    }
  }

  await sql`
    UPDATE bo_email_campaigns
    SET status = 'sent', sent_at = now(), recipient_count = ${recipients.length}, sent_count = ${sentCount}, failed_count = ${failedCount}, updated_at = now()
    WHERE id = ${campaign.id}
  `
  const rows = (await sql`SELECT * FROM bo_email_campaigns WHERE id = ${campaign.id}`) as unknown as BoEmailCampaign[]
  return rows[0]
}
