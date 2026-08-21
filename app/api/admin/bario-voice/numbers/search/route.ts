import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { searchAvailableNumbers, type NumberType } from '@/lib/twilioNumbers'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const url = new URL(req.url)
    const type = (url.searchParams.get('type') === 'tollfree' ? 'tollfree' : 'local') as NumberType
    const areaCode = url.searchParams.get('areaCode') || undefined
    const contains = url.searchParams.get('contains') || undefined

    const numbers = await searchAvailableNumbers(type, { areaCode, contains })
    return NextResponse.json({ ok: true, numbers })
  } catch (err: any) {
    return errorResponse(err)
  }
}
