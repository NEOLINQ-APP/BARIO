import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import { reviewAndDraftFollowUps } from '@/lib/agents/miko'

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const { organizationId, limit } = await req.json()
    if (typeof organizationId !== 'string' || !organizationId) {
      return NextResponse.json({ error: 'organizationId is required' }, { status: 400 })
    }
    const result = await reviewAndDraftFollowUps(organizationId, typeof limit === 'number' ? limit : 10)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return errorResponse(err)
  }
}
