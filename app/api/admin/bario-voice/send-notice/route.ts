import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { Resend } from 'resend'
import { errorResponse } from '@/lib/errors'

// One-off Bario Voice notice sender (suspension/collections notices) —
// needs a custom From display name + Reply-To distinct from lib/email.ts's
// shared transactional sender, so this calls Resend directly rather than
// widening that shared helper for one campaign's branding.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const to = typeof body?.to === 'string' ? body.to.trim() : ''
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
    const html = typeof body?.html === 'string' ? body.html : ''
    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'to, subject, and html are required' }, { status: 400 })
    }

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY is not set' }, { status: 500 })

    const resend = new Resend(resendKey)
    const { error } = await resend.emails.send({
      from: 'Bario Voice <noreply@send.bario.ca>',
      to,
      replyTo: 'support@bario.ca',
      subject,
      html,
    })
    if (error) throw new Error(error.message)

    await logAdminAction(sql, { action: 'bario_voice_notice_sent', targetEmail: to, params: { subject }, result: 'ok' })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
