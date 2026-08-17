import nodemailer from 'nodemailer'
import { decryptPassword } from '@/lib/vpsPassword'
import type { BoOrganization } from '@/lib/db'

export type CrmMailboxCreds = {
  email: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  password: string
}

// Null if the org has no CRM mailbox provisioned yet -- callers fall back
// to the shared Resend identity (outbound) or simply skip the org (inbound
// cron) in that case.
export function getCrmMailboxCreds(org: BoOrganization): CrmMailboxCreds | null {
  if (
    !org.crm_mailbox_email ||
    !org.crm_mailbox_imap_host ||
    !org.crm_mailbox_imap_port ||
    !org.crm_mailbox_smtp_host ||
    !org.crm_mailbox_smtp_port ||
    !org.crm_mailbox_password_ciphertext ||
    !org.crm_mailbox_password_iv
  ) {
    return null
  }
  return {
    email: org.crm_mailbox_email,
    imapHost: org.crm_mailbox_imap_host,
    imapPort: org.crm_mailbox_imap_port,
    smtpHost: org.crm_mailbox_smtp_host,
    smtpPort: org.crm_mailbox_smtp_port,
    password: decryptPassword(org.crm_mailbox_password_ciphertext, org.crm_mailbox_password_iv),
  }
}

// Sends via the org's own mailbox (not Resend) so the customer's reply
// naturally lands in the same mailbox app/api/cron/crm-email-sync polls.
export async function sendViaCrmMailbox(
  creds: CrmMailboxCreds,
  opts: { to: string; subject: string; html: string }
): Promise<{ messageId: string }> {
  const transporter = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: creds.smtpPort === 465,
    auth: { user: creds.email, pass: creds.password },
  })
  const info = await transporter.sendMail({ from: creds.email, to: opts.to, subject: opts.subject, html: opts.html })
  return { messageId: info.messageId }
}
