import nodemailer from 'nodemailer'

// Thin wrapper around the self-hosted Mailcow sending subdomains
// (send.afclogistics.ca / send.sunbuiltgroup.com) — see
// bario_mailcow / bario_crm_dual_instances memory for the setup. Each
// client's outreach mailbox is a real SMTP account on reseller.bario.ca,
// completely isolated from their actual business email (which stays on
// Hostinger, untouched).
export async function sendOutreachEmail(opts: {
  smtpUser: string
  smtpPass: string
  from: string
  to: string
  subject: string
  text: string
}): Promise<{ messageId: string }> {
  const transporter = nodemailer.createTransport({
    host: 'reseller.bario.ca',
    port: 587,
    secure: false,
    auth: { user: opts.smtpUser, pass: opts.smtpPass },
  })
  const info = await transporter.sendMail({
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  })
  return { messageId: info.messageId }
}
