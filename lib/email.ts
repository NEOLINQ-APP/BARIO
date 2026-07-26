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
