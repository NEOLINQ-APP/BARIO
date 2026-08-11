import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { refreshConnectStatus, BARIO_PAYMENTS_FEE_PERCENT } from '@/lib/barioOnePayments'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoModule('payments')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const result = await refreshConnectStatus(sql, org)
    return NextResponse.json({ ...result, feePercent: BARIO_PAYMENTS_FEE_PERCENT })
  } catch (err: any) {
    return errorResponse(err)
  }
}
