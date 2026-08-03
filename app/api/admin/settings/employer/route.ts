import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getEmployerInfo, setSetting } from '@/lib/platformSettings'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const info = await getEmployerInfo(auth.sql)
    return NextResponse.json({ ok: true, ...info })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.name === 'string') await setSetting(auth.sql, 'employer_name', body.name.trim())
    if (typeof body?.address === 'string') await setSetting(auth.sql, 'employer_address', body.address.trim())
    if (typeof body?.businessNumber === 'string') await setSetting(auth.sql, 'employer_business_number', body.businessNumber.trim())
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
