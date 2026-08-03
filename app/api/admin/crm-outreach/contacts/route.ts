import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { OUTREACH_CRMS, crmGraphQL } from '@/lib/crmOutreach'
import { errorResponse } from '@/lib/errors'

// Every contact with a phone number, for both CRMs — separate from
// ./pending's list (which is scoped to contacts with an AI-drafted email
// ready for review). Click-to-call needs a phone number, not a drafted
// email, so this is deliberately the broader "everyone we could call" set.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck

  try {
    const url = new URL(req.url)
    const onlyCrmKey = url.searchParams.get('crmKey')
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
