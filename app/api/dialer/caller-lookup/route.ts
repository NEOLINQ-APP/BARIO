import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { verifyDialerPasscode } from '@/lib/dialerAccess'
import { BARIO_ONE_CALL_LOG_ORG_IDS } from '@/lib/barioOneCrmCallLog'

// Real caller-ID-by-name for the Dialer app: given the business the call
// came in on and the caller's real phone number (now correctly passed
// through as of the dialer-inbound TwiML fix), look up whether that number
// already exists as a bo_customers contact in that business's own CRM.
// Deliberately read-only -- unlike Victoria's own findOrCreateBoCustomerByPhone,
// this never creates a new contact just because someone called; it only
// shows a name when one is already known.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const businessKey = url.searchParams.get('businessKey')
  const phone = url.searchParams.get('phone')
  if (!businessKey || !phone) {
    return NextResponse.json({ error: 'businessKey and phone are required' }, { status: 400 })
  }

  let sql: Awaited<ReturnType<typeof db>>
  if (verifyDialerPasscode(req, businessKey)) {
    sql = await db()
  } else {
    const adminOrRes = await requireAdmin(req)
    if (adminOrRes instanceof NextResponse) return adminOrRes
    sql = adminOrRes.sql
  }

  const orgId = BARIO_ONE_CALL_LOG_ORG_IDS[businessKey]
  if (!orgId) return NextResponse.json({ name: null, companyName: null })

  const digits = phone.replace(/\D/g, '')
  const target = digits.length > 10 ? digits.slice(-10) : digits
  if (!target) return NextResponse.json({ name: null, companyName: null })

  const rows = (await sql`
    SELECT contact_name, company_name FROM bo_customers
    WHERE organization_id = ${orgId} AND phone IS NOT NULL
      AND right(regexp_replace(phone, '\D', '', 'g'), 10) = ${target}
    LIMIT 1
  `) as unknown as { contact_name: string; company_name: string | null }[]

  const match = rows[0]
  return NextResponse.json({ name: match?.contact_name ?? null, companyName: match?.company_name ?? null })
}
