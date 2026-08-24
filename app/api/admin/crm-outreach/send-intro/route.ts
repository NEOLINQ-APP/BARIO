import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { sendIntroOutreachBatch } from '@/lib/crmIntroOutreach'

// Real admin-triggered send for the AFC/Sunbuilt intro-outreach campaign
// (built 2026-08-24, see lib/crmIntroOutreach.ts) -- deliberately manual
// rather than a recurring cron for now, so each real batch to real leads
// gets a conscious decision rather than firing on a timer unattended.
export async function POST(req: Request) {
  const adminOrRes = await requireAdmin(req)
  if (adminOrRes instanceof NextResponse) return adminOrRes
  const sql = adminOrRes.sql

  const body = await req.json().catch(() => ({}))
  const businessKey = body?.businessKey
  const limit = Number.isFinite(body?.limit) ? Math.max(1, Math.min(50, body.limit)) : 20
  if (businessKey !== 'afc' && businessKey !== 'sunbuilt') {
    return NextResponse.json({ error: 'businessKey must be "afc" or "sunbuilt"' }, { status: 400 })
  }

  try {
    const result = await sendIntroOutreachBatch(sql, businessKey, limit)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Send failed' }, { status: 500 })
  }
}
