import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { findCrm, crmGraphQL, EMAIL_TONES, isEmailTone, EMAIL_TYPES, isEmailTypeKey } from '@/lib/crmOutreach'
import { getOpenAI } from '@/lib/openai'
import { errorResponse } from '@/lib/errors'

export const maxDuration = 120

// Regenerates drafts for many contacts at once with one chosen tone/email
// type — either a specific list of personIds, or every not-yet-sent
// contact for the CRM when personIds is omitted ("All"). Same as the
// single-contact redraft route: only produces new candidate text for the
// admin to review; nothing here sends anything.
export async function POST(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const { crmKey, tone, emailType, personIds } = await req.json()
    const crm = findCrm(crmKey)
    if (!crm) return NextResponse.json({ error: 'Unknown crmKey' }, { status: 400 })
    if (!isEmailTone(tone)) return NextResponse.json({ error: `tone must be one of: ${Object.keys(EMAIL_TONES).join(', ')}` }, { status: 400 })
    const resolvedType = isEmailTypeKey(emailType) ? emailType : 'direct_pitch'

    let targetIds: string[]
    if (Array.isArray(personIds) && personIds.length > 0) {
      targetIds = personIds
    } else {
      const rows = (await sql`
        SELECT person_id FROM crm_leadgen_drafted WHERE crm_key = ${crmKey} AND sent_at IS NULL
      `) as unknown as { person_id: string }[]
      targetIds = rows.map((r) => r.person_id)
    }

    const peopleData = await crmGraphQL(crm, `query { people(first: 500) { edges { node { id name { firstName lastName } company { name } } } } }`, {})
    const peopleById = new Map<string, { name?: { firstName?: string; lastName?: string }; company?: { name?: string } }>(
      (peopleData?.people?.edges ?? []).map((e: any) => [e.node.id, e.node])
    )

    const openai = getOpenAI()
    const results: { personId: string; draft: string }[] = []
    const errors: string[] = []

    for (const personId of targetIds) {
      const person = peopleById.get(personId)
      if (!person) {
        errors.push(`${personId}: contact not found`)
        continue
      }
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-5.6-luna',
          messages: [
            {
              role: 'system',
              content: `You draft short, first-touch sales outreach emails for ${crm.businessName}, written as if from a real person on their team. Email type: ${EMAIL_TYPES[resolvedType].instruction} Tone: ${EMAIL_TONES[tone as keyof typeof EMAIL_TONES].instruction} Under 120 words. Never mention AI, automation, being a bot/assistant, or that this was generated — write it exactly as a human would. Return ONLY the email body text, no subject line, no markdown headers.`,
            },
            {
              role: 'user',
              content: `Draft an outreach email to ${person.name?.firstName ?? ''} ${person.name?.lastName ?? ''}${person.company?.name ? ` at ${person.company.name}` : ''}.`,
            },
          ],
          max_completion_tokens: 400,
        })
        const draft = completion.choices[0]?.message?.content?.trim() || ''
        if (draft) results.push({ personId, draft })
      } catch (err: any) {
        errors.push(`${personId}: ${err.message}`)
      }
    }

    return NextResponse.json({ ok: true, results, errors })
  } catch (err: any) {
    return errorResponse(err)
  }
}
