import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { findCrm, crmGraphQL, EMAIL_TONES, isEmailTone } from '@/lib/crmOutreach'
import { getOpenAI } from '@/lib/openai'
import { errorResponse } from '@/lib/errors'

// Regenerates an outreach draft in a chosen tone — a preview the admin can
// edit before sending (does not touch the CRM Note or the sent_* columns;
// the send route already accepts a subject/body override, this just
// produces a new candidate for that same textarea).
export async function POST(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck

  try {
    const { crmKey, personId, tone } = await req.json()
    const crm = findCrm(crmKey)
    if (!crm) return NextResponse.json({ error: 'Unknown crmKey' }, { status: 400 })
    if (!isEmailTone(tone)) return NextResponse.json({ error: `tone must be one of: ${Object.keys(EMAIL_TONES).join(', ')}` }, { status: 400 })

    const personData = await crmGraphQL(
      crm,
      `query($id: UUID!) { person(filter: {id: {eq: $id}}) { id name { firstName lastName } company { name } } }`,
      { id: personId }
    )
    const person = personData?.person
    if (!person) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    const openai = getOpenAI()
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.6-luna',
      messages: [
        {
          role: 'system',
          content: `You draft short, first-touch sales outreach emails for ${crm.businessName}, written as if from a real person on their team. Tone: ${EMAIL_TONES[tone as keyof typeof EMAIL_TONES].instruction} One clear reason to reply. Under 120 words. Never mention AI, automation, being a bot/assistant, or that this was generated — write it exactly as a human would. Return ONLY the email body text, no subject line, no markdown headers.`,
        },
        {
          role: 'user',
          content: `Draft an outreach email to ${person.name?.firstName ?? ''} ${person.name?.lastName ?? ''}${person.company?.name ? ` at ${person.company.name}` : ''}.`,
        },
      ],
      max_completion_tokens: 400,
    })
    const draft = completion.choices[0]?.message?.content?.trim() || ''
    return NextResponse.json({ ok: true, draft })
  } catch (err: any) {
    return errorResponse(err)
  }
}
