import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { sendEmail } from '@/lib/email'
import { errorResponse } from '@/lib/errors'

// Lets Claude Code (or any admin script) send an arbitrary one-off email
// through Bario's real verified sending domain, reusing lib/email.ts's
// sendEmail rather than guessing at the From address / Resend key locally
// — same Bearer-gated pattern as every other /api/admin/* route.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const to = typeof body?.to === 'string' ? body.to.trim() : ''
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
    const html = typeof body?.html === 'string' ? body.html : ''
    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'to, subject, and html are required' }, { status: 400 })
    }

    await sendEmail(to, subject, html)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
