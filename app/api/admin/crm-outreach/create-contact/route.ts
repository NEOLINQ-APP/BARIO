import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { findCrm, crmGraphQL } from '@/lib/crmOutreach'
import { verifyDialerPasscode } from '@/lib/dialerAccess'
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
    const crm = findCrm(crmKey)
    if (!crm) return NextResponse.json({ error: 'That business has no CRM to add a contact to' }, { status: 400 })

    const personData: Record<string, unknown> = {
      name: { firstName: firstName || 'Unknown', lastName: lastName || '' },
      phones: { primaryPhoneNumber: phone, primaryPhoneCallingCode: '' },
    }
    if (email) personData.emails = { primaryEmail: email, additionalEmails: [] }
    if (companyName) personData.jobTitle = companyName

    const data = await crmGraphQL(
      crm,
      `mutation($data: PersonCreateInput!) { createPerson(data: $data) { id } }`,
      { data: personData }
    )

    return NextResponse.json({ ok: true, personId: data?.createPerson?.id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
