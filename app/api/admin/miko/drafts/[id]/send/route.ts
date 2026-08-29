import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import { sendEmail } from '@/lib/email'

// The one place a Miko-drafted follow-up actually leaves the building --
// requires an explicit admin action per draft, never automatic. Real send,
// via the same sendEmail() every other real BARIO email goes through.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const rows = await sql`SELECT * FROM miko_followup_drafts WHERE id = ${params.id}`
    const draft = (rows as any)[0]
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    if (draft.status !== 'draft') return NextResponse.json({ error: `Already ${draft.status}` }, { status: 409 })
    if (!draft.customer_email) return NextResponse.json({ error: 'No email on file for this customer' }, { status: 400 })

    await sendEmail(draft.customer_email, draft.subject, draft.body_html)
    await sql`UPDATE miko_followup_drafts SET status = 'sent', sent_at = now() WHERE id = ${params.id}`

    return NextResponse.json({ ok: true, sentTo: draft.customer_email })
  } catch (err: any) {
    return errorResponse(err)
  }
}
