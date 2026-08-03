import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { placeMikoOutboundCall } from '@/lib/twilio'
import { errorResponse } from '@/lib/errors'

// Triggers a real outbound call from Victoria's own number — the
// admin-panel equivalent of asking her to call someone mid-conversation
// (call_contact), for placing a call from outside an existing call
// (testing, or any future "have her call so-and-so" trigger from the
// dashboard rather than from a live call with her).
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const toNumber = typeof body?.toNumber === 'string' ? body.toNumber.trim() : ''
    const jobContext = typeof body?.jobContext === 'string' ? body.jobContext.trim() : 'A check-in call.'
    if (!/^\+?[0-9]{7,15}$/.test(toNumber)) {
      return NextResponse.json({ error: 'toNumber must be a valid phone number' }, { status: 400 })
    }

    const result = await placeMikoOutboundCall({ toNumber, jobContext })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return errorResponse(err)
  }
}
