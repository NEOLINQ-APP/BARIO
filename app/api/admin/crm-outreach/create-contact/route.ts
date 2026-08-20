import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { BARIO_ONE_CALL_LOG_ORG_IDS, createBoContact } from '@/lib/barioOneCrmCallLog'
import { verifyDialerPasscode } from '@/lib/dialerAccess'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Adds a new contact straight into the right business's Twenty CRM — used
// by Bario Dialer's "New Contact" screen so a client picked up on a call
// can be saved without ever opening Twenty CRM directly. Twenty's core
// object mutations take `data:` (not `input:`), confirmed against this
// same CRM elsewhere in the codebase.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const crmKey = typeof body?.crmKey === 'string' ? body.crmKey : null

  if (!verifyDialerPasscode(req, crmKey)) {
    const adminOrRes = await requireAdmin(req)
    if (adminOrRes instanceof NextResponse) return adminOrRes
  }

  try {
    const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : ''
    const lastName = typeof body?.lastName === 'string' ? body.lastName.trim() : ''
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    // Linking to an existing Company (or creating one) is a separate
    // lookup/relation this form doesn't handle yet — companyName is kept
    // as a plain note on the record for now rather than silently dropped,
    // and a real company link can still be added by hand in Twenty CRM.
    const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : ''

    if (!crmKey || (!firstName && !lastName) || !phone) {
      return NextResponse.json({ error: 'crmKey, a name, and a phone number are required' }, { status: 400 })
    }

    // All 4 businesses now repointed to their real Bario One CRM (afc/
    // sunbuilt 2026-08-18, unique/bario 2026-08-20) — the crmGraphQL/Twenty
    // path below is unreachable for any real OUTREACH_CRMS key now, kept
    // only as a guard for an unrecognized crmKey.
    const orgId = BARIO_ONE_CALL_LOG_ORG_IDS[crmKey]
    if (orgId) {
      const sql = await db()
      const customerId = await createBoContact(sql, orgId, { firstName, lastName, phone, email, companyName })
      return NextResponse.json({ ok: true, personId: customerId })
    }

    return NextResponse.json({ error: 'That business has no CRM to add a contact to' }, { status: 400 })
  } catch (err: any) {
    return errorResponse(err)
  }
}
