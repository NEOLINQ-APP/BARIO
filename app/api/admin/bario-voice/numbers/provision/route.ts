import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { provisionNumber } from '@/lib/twilioNumbers'
import { errorResponse } from '@/lib/errors'

// Real, immediate purchase -- this is not a preview/dry-run. Only ever
// called after an admin (or an automated onboarding flow, once one exists)
// has already confirmed the exact number with the customer.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { phoneNumber, friendlyName } = await req.json()
    if (typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
      return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 })
    }

    const result = await provisionNumber(phoneNumber.trim(), typeof friendlyName === 'string' && friendlyName.trim() ? friendlyName.trim() : phoneNumber.trim())

    await logAdminAction(sql, { action: 'bario_voice_provision_number', targetEmail: result.phoneNumber, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })

    return NextResponse.json({ ok: true, sid: result.sid, phoneNumber: result.phoneNumber })
  } catch (err: any) {
    return errorResponse(err)
  }
}
