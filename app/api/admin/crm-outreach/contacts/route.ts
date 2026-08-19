import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { OUTREACH_CRMS, crmGraphQL } from '@/lib/crmOutreach'
import { BARIO_ONE_CALL_LOG_ORG_IDS, listBoContactsWithPhone } from '@/lib/barioOneCrmCallLog'
import { verifyDialerPasscode } from '@/lib/dialerAccess'
import { db } from '@/lib/db'
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
    // AFC and Sunbuilt repointed to their real Bario One CRM 2026-08-18
    // (their standalone Twenty stacks were deleted) — Unique Group has no
    // CRM behind it at all (it's Bario's own agency, not a client).
    const crms = onlyCrmKey ? OUTREACH_CRMS.filter((c) => c.key === onlyCrmKey) : OUTREACH_CRMS
    const sql = await db()

    // Per-CRM try/catch so one business's fetch failing (a real risk now
    // that afc/sunbuilt and unique/bario are on two different backends)
    // doesn't wipe out the other businesses' contact lists too.
    const results = []
    for (const crm of crms) {
      try {
        if (crm.key === 'afc' || crm.key === 'sunbuilt') {
          const orgId = BARIO_ONE_CALL_LOG_ORG_IDS[crm.key]
          const contacts = await listBoContactsWithPhone(sql, orgId)
          results.push({ crm: crm.key, businessName: crm.businessName, contacts })
          continue
        }

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
      } catch (err) {
        console.error(`Failed to load contacts for ${crm.key}`, err)
        results.push({ crm: crm.key, businessName: crm.businessName, contacts: [] })
      }
    }
    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return errorResponse(err)
  }
}
