import { Resend } from 'resend'

let _resend: Resend | undefined

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY!)
  }
  return _resend
}

const FROM = process.env.EMAIL_FROM || 'Bario <onboarding@resend.dev>'

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: 'Reset your Bario password',
    html: `
      <p>Someone requested a password reset for your Bario account.</p>
      <p><a href="${resetUrl}">Click here to set a new password</a> (this link expires in 1 hour).</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  })
}

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: 'Verify your Bario email',
    html: `
      <p>Welcome to Bario! Please confirm this is your email address.</p>
      <p><a href="${verifyUrl}">Click here to verify your email</a> (this link expires in 24 hours).</p>
      <p>If you didn't create a Bario account, you can safely ignore this email.</p>
    `,
  })
}

export async function sendPaymentReminderEmail(to: string, siteName: string) {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Action needed on your website — ${siteName}`,
    html: `
      <p>Hi,</p>
      <p>This is a reminder about your website, <strong>${siteName}</strong>, built through Bario.</p>
      <p>Please contact <a href="mailto:support@bario.ca">support@bario.ca</a> regarding your site access at your earliest convenience.</p>
      <p>Thanks,<br/>Bario</p>
    `,
  })
}

export async function sendInvoiceEmail(to: string, opts: { type: 'quote' | 'invoice'; number: string; totalDisplay: string; viewUrl: string }) {
  const label = opts.type === 'quote' ? 'quote' : 'invoice'
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${opts.type === 'quote' ? 'Quote' : 'Invoice'} ${opts.number} from Bario — ${opts.totalDisplay}`,
    html: `
      <p>Hi,</p>
      <p>Please find your ${label} <strong>${opts.number}</strong> for <strong>${opts.totalDisplay}</strong> attached below.</p>
      <p><a href="${opts.viewUrl}">View ${label} and pay online</a></p>
      <p>Thanks,<br/>Bario</p>
    `,
  })
}

// Generic sender — used by Victoria's assistant app (lib/victoriaAppTools.ts)
// to send an actual email on Sherwin's behalf, as opposed to every other
// export in this file being a single fixed template.
export async function sendEmail(to: string, subject: string, html: string) {
  await getResend().emails.send({ from: FROM, to, subject, html })
}

export async function sendFamilyInviteEmail(to: string, inviterEmail: string, acceptUrl: string) {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${inviterEmail} invited you to share their Bario storage plan`,
    html: `
      <p>${inviterEmail} invited you to join their family storage plan on Bario — you'll share their storage space at no extra cost.</p>
      <p><a href="${acceptUrl}">Click here to accept the invite</a> (this link expires in 7 days). You'll need a Bario account with this email address, or you can create one.</p>
      <p>If you weren't expecting this, you can safely ignore this email.</p>
    `,
  })
}
