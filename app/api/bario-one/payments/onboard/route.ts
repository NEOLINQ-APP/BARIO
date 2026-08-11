import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { getOrCreateConnectAccount, createOnboardingLink } from '@/lib/barioOnePayments'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('payments')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the account owner can set up payments' }, { status: 403 })
    }

    const origin = req.headers.get('origin') ?? 'https://bario.ca'
    const accountId = await getOrCreateConnectAccount(sql, org)
    const url = await createOnboardingLink(
      accountId,
      `${origin}/dashboard/bario-one/payments?onboarded=1`,
      `${origin}/dashboard/bario-one/payments`
    )
    return NextResponse.json({ ok: true, url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
