import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { DEFAULT_LEAD_SCORE_WEIGHTS, getLeadScoreWeights, setLeadScoreWeights, type LeadScoreWeights } from '@/lib/leadScoreConfig'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const weights = await getLeadScoreWeights(auth.sql)
    return NextResponse.json({ weights, defaults: DEFAULT_LEAD_SCORE_WEIGHTS })
  } catch (err) {
    return errorResponse(err)
  }
}

function sanitizeGroup(input: any, defaults: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...defaults }
  if (input && typeof input === 'object') {
    for (const key of Object.keys(defaults)) {
      const v = Number(input[key])
      if (Number.isFinite(v)) out[key] = Math.max(0, Math.round(v))
    }
  }
  return out
}

export async function PUT(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json().catch(() => ({}))
    const weights: LeadScoreWeights = {
      fit: sanitizeGroup(body?.fit, DEFAULT_LEAD_SCORE_WEIGHTS.fit) as LeadScoreWeights['fit'],
      need: sanitizeGroup(body?.need, DEFAULT_LEAD_SCORE_WEIGHTS.need) as LeadScoreWeights['need'],
      intent: sanitizeGroup(body?.intent, DEFAULT_LEAD_SCORE_WEIGHTS.intent) as LeadScoreWeights['intent'],
      timing: sanitizeGroup(body?.timing, DEFAULT_LEAD_SCORE_WEIGHTS.timing) as LeadScoreWeights['timing'],
      dataQuality: sanitizeGroup(body?.dataQuality, DEFAULT_LEAD_SCORE_WEIGHTS.dataQuality) as LeadScoreWeights['dataQuality'],
    }
    await setLeadScoreWeights(auth.sql, weights)
    return NextResponse.json({ ok: true, weights })
  } catch (err) {
    return errorResponse(err)
  }
}
