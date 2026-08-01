import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { findCrm } from '@/lib/crmOutreach'
import { getOpenAI } from '@/lib/openai'
import { errorResponse } from '@/lib/errors'

// Drafts (does not send) an AI response to an inbound reply — a preview an
// admin can edit before sending via ./send-reply. Same no-AI-disclosure
// rule as the original outreach draft.
export async function POST(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const { replyId } = await req.json()
    const rows = (await sql`SELECT crm_key, from_email, subject, body FROM crm_outreach_replies WHERE id = ${replyId}`) as unknown as {
      crm_key: string
      from_email: string
      subject: string
      body: string
    }[]
    const reply = rows[0]
    if (!reply) return NextResponse.json({ error: 'Reply not found' }, { status: 404 })
    const crm = findCrm(reply.crm_key)
    if (!crm) return NextResponse.json({ error: 'Unknown crmKey' }, { status: 400 })

    const openai = getOpenAI()
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.6-luna',
      messages: [
        {
          role: 'system',
          content: `You write short, natural email replies for ${crm.businessName}, as if from a real person on their team responding to a prospect who replied to an earlier outreach email. Match the tone of their message. Be direct and helpful, under 120 words. Never mention AI, automation, being a bot/assistant, or that this was generated — write it exactly as a human would. Return ONLY the reply body text, no subject line.`,
        },
        {
          role: 'user',
          content: `They replied:\n\n"${reply.body}"\n\nDraft a reply.`,
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
