import { randomUUID } from 'node:crypto'
import type { BoOrganization, BoEmailCampaign } from '@/lib/db'
import { getCrmMailboxCreds, sendViaCrmMailbox } from '@/lib/barioOneCrmMailbox'
import { sendEmail } from '@/lib/email'

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
  opts: { name: string; subject: string; body: string; scheduledAt: Date | null; createdByUserId: string | null; createdVia: 'admin' | 'ai_assistant' }
): Promise<BoEmailCampaign> {
  const id = randomUUID()
  const bodyHtml = opts.body.trim().replace(/\n/g, '<br/>')
  const isScheduledForLater = opts.scheduledAt !== null && opts.scheduledAt.getTime() > Date.now()
  const status = isScheduledForLater ? 'scheduled' : 'draft'

  await sql`
    INSERT INTO bo_email_campaigns (id, organization_id, name, subject, body_html, status, scheduled_at, created_by_user_id, created_via)
    VALUES (${id}, ${org.id}, ${opts.name}, ${opts.subject}, ${bodyHtml}, ${status}, ${isScheduledForLater ? opts.scheduledAt : null}, ${opts.createdByUserId}, ${opts.createdVia})
  `
  const rows = (await sql`SELECT * FROM bo_email_campaigns WHERE id = ${id}`) as unknown as BoEmailCampaign[]
  const campaign = rows[0]

  if (status === 'draft') {
    return await sendCampaignNow(sql, org, campaign)
  }
  return campaign
}

export async function sendCampaignNow(sql: any, org: BoOrganization, campaign: BoEmailCampaign): Promise<BoEmailCampaign> {
  await sql`UPDATE bo_email_campaigns SET status = 'sending', updated_at = now() WHERE id = ${campaign.id}`

  const recipients = (await sql`
    SELECT id, email FROM bo_customers WHERE organization_id = ${org.id} AND email IS NOT NULL AND email <> ''
  `) as unknown as { id: string; email: string }[]

  const creds = getCrmMailboxCreds(org)
  let sentCount = 0
  let failedCount = 0

  for (const recipient of recipients) {
    try {
      let messageId: string | null = null
      if (creds) {
        const result = await sendViaCrmMailbox(creds, { to: recipient.email, subject: campaign.subject, html: campaign.body_html })
        messageId = result.messageId
      } else {
        await sendEmail(recipient.email, campaign.subject, campaign.body_html)
      }
      await sql`
        INSERT INTO bo_notes (id, organization_id, customer_id, kind, body, direction, from_email, message_id, campaign_id)
        VALUES (${randomUUID()}, ${org.id}, ${recipient.id}, 'email', ${`Subject: ${campaign.subject}\n\n${campaign.body_html}`}, 'outbound', ${creds?.email ?? null}, ${messageId}, ${campaign.id})
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
