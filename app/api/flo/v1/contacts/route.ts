import { NextResponse } from 'next/server'
import { requireFloApiKey } from '@/lib/flo/auth'
import { queryTwenty, TwentyNotLinkedError } from '@/lib/flo/twentyClient'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireFloApiKey(req)
  if (auth instanceof NextResponse) return auth
  const { crmStack } = auth

  try {
    const data = await queryTwenty(
      crmStack,
      `query { people(first: 100) { edges { node { id name { firstName lastName } emails { primaryEmail } phones { primaryPhoneNumber } company { name } } } } }`
    )
    const contacts = (data?.people?.edges ?? []).map((e: any) => ({
      id: e.node.id,
      firstName: e.node.name?.firstName ?? null,
      lastName: e.node.name?.lastName ?? null,
      email: e.node.emails?.primaryEmail ?? null,
      phone: e.node.phones?.primaryPhoneNumber ?? null,
      company: e.node.company?.name ?? null,
    }))
    return NextResponse.json({ contacts })
  } catch (err: any) {
    if (err instanceof TwentyNotLinkedError) return NextResponse.json({ error: err.message }, { status: 409 })
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireFloApiKey(req)
  if (auth instanceof NextResponse) return auth
  const { crmStack } = auth

  try {
    const body = await req.json()
    const firstName = typeof body?.firstName === 'string' ? body.firstName : ''
    const lastName = typeof body?.lastName === 'string' ? body.lastName : ''
    const email = typeof body?.email === 'string' ? body.email : null
    const phone = typeof body?.phone === 'string' ? body.phone : null
    if (!firstName && !lastName) return NextResponse.json({ error: 'firstName or lastName is required' }, { status: 400 })

    const data = await queryTwenty(
      crmStack,
      `mutation($data: PersonCreateInput!) { createPerson(data: $data) { id } }`,
      {
        data: {
          name: { firstName, lastName },
          ...(email ? { emails: { primaryEmail: email } } : {}),
          ...(phone ? { phones: { primaryPhoneNumber: phone } } : {}),
        },
      }
    )
    return NextResponse.json({ ok: true, id: data.createPerson.id })
  } catch (err: any) {
    if (err instanceof TwentyNotLinkedError) return NextResponse.json({ error: err.message }, { status: 409 })
    return errorResponse(err)
  }
}
