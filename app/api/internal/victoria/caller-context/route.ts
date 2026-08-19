import { NextResponse } from 'next/server'
import { findCrm, fetchPriorCallContext } from '@/lib/crmOutreach'
import { db } from '@/lib/db'
import { BARIO_ONE_CALL_LOG_ORG_IDS, fetchPriorBoCallContext } from '@/lib/barioOneCrmCallLog'

// Called by miko-voice/server.js at call setup (the missing read-side of
// the existing write-only log-call-at-hangup flow) — lets Victoria/Layla
// be briefed on a returning caller's prior notes instead of starting
// every call from zero, and avoids re-asking for info already on file.
// Same Bearer auth as app/api/admin/victoria/log-call — this is a
// server-to-server route, not customer-facing.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const adminKey = process.env.BARIO_ADMIN_API_KEY
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(req.url)
  const businessKey = url.searchParams.get('businessKey') ?? ''
  const phone = url.searchParams.get('phone') ?? ''
  if (!['afc', 'sunbuilt', 'unique', 'bario'].includes(businessKey) || !phone) {
    return NextResponse.json({ context: null })
  }

  if (businessKey === 'afc' || businessKey === 'sunbuilt') {
    const sql = await db()
    const orgId = BARIO_ONE_CALL_LOG_ORG_IDS[businessKey]
    const context = await fetchPriorBoCallContext(sql, orgId, phone)
    return NextResponse.json({ context })
  }

  const crm = findCrm(businessKey)
  if (!crm) return NextResponse.json({ context: null })

  const context = await fetchPriorCallContext(crm, phone)
  return NextResponse.json({ context })
}
