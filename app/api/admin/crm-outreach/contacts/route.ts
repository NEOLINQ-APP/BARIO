import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { OUTREACH_CRMS, crmGraphQL } from '@/lib/crmOutreach'
import { verifyDialerPasscode } from '@/lib/dialerAccess'
import { errorResponse } from '@/lib/errors'

// Every contact with a phone number, for both CRMs — separate from
// ./pending's list (which is scoped to contacts with an AI-drafted email
// ready for review). Click-to-call needs a phone number, not a drafted
// email, so this is deliberately the broader "everyone we could call" set.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const onlyCrmKey = url.searchParams.get('crmKey')

  const viaPasscode = verifyDialerPasscode(req, onlyCrmKey)
  if (!viaPasscode) {
    const adminCheck = await requireAdmin(req)
    if (adminCheck instanceof NextResponse) return adminCheck
  }

  try {
    // Client Dialer callers (passcode-verified) must pass their own crmKey
    // and can never see another business's contacts — an admin session can
    // still omit crmKey to see everyone, same as before.
    if (viaPasscode && !onlyCrmKey) {
      return NextResponse.json({ error: 'crmKey is required' }, { status: 400 })
    }
    // Unique Group Inc. has no Twenty CRM behind it (it's Bario's own
    // agency, not a client) — nothing to fetch, not an error.
    const crms = onlyCrmKey ? OUTREACH_CRMS.filter((c) => c.key === onlyCrmKey) : OUTREACH_CRMS

    const results = []
    for (const crm of crms) {
      const peopleData = await crmGraphQL(
        crm,
        `query { people(first: 500) { edges { node { id name { firstName lastName } phones { primaryPhoneNumber primaryPhoneCallingCode } company { name } } } } }`,
        {}
      )
      const edges = peopleData?.people?.edges ?? []
      const contacts = []
      for (const e of edges) {
        const person = e.node
        const rawPhone = person?.phones?.primaryPhoneNumber
        if (!rawPhone) continue
        contacts.push({
          personId: person.id,
          name: [person.name?.firstName, person.name?.lastName].filter(Boolean).join(' ') || 'Unknown',
          companyName: person.company?.name ?? null,
          phone: `${person.phones.primaryPhoneCallingCode ?? ''}${rawPhone}`,
        })
      }
      results.push({ crm: crm.key, businessName: crm.businessName, contacts })
    }
    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return errorResponse(err)
  }
}
