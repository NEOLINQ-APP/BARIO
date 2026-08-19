import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// AI-drafted reply suggestion for one lead's email thread -- the same
// capability the old Twenty-based AI-outreach system had (draft-reply/
// redraft), now built directly against Bario One's CRM instead of a
// separate system. Returns a suggestion for the admin/business to review
// and edit before sending -- never sends anything itself.
export async function POST(req: Request, { params }: { params: { id: string; customerId: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const customerRows = (await sql`
      SELECT company_name, contact_name FROM bo_customers WHERE id = ${params.customerId} AND organization_id = ${params.id}
    `) as unknown as { company_name: string | null; contact_name: string }[]
    const customer = customerRows[0]
    if (!customer) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const thread = (await sql`
      SELECT direction, body, created_at FROM bo_notes
      WHERE customer_id = ${params.customerId} AND kind = 'email'
      ORDER BY created_at ASC
    `) as unknown as { direction: string | null; body: string; created_at: string }[]

    if (thread.length === 0) {
      return NextResponse.json({ error: 'No email thread yet for this lead -- nothing to reply to.' }, { status: 400 })
    }

    const { instruction } = await req.json().catch(() => ({}))

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI drafting is not configured' }, { status: 500 })
    const anthropic = new Anthropic({ apiKey })

    const threadText = thread
      .map((t) => `[${t.direction === 'inbound' ? 'Them' : 'Us'}]\n${t.body}`)
      .join('\n\n---\n\n')

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      system:
        'You draft one reply email in an ongoing B2B sales/support conversation. Read the full thread and write a natural next reply from "Us" to "Them" — respond to whatever they most recently said, don\'t re-introduce yourself if this isn\'t the first message. Keep it concise and professional. Respond with ONLY raw JSON, no markdown fences: {"subject": string, "body": string}. body uses \\n for line breaks, no HTML.',
      messages: [
        {
          role: 'user',
          content: `Lead: ${customer.contact_name}${customer.company_name ? ` at ${customer.company_name}` : ''}\n\nThread so far:\n${threadText}${instruction ? `\n\nSpecific instruction for this reply: ${instruction}` : ''}`,
        },
      ],
    })

    const textBlock = response.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n')
    const jsonMatch = textBlock.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Could not generate a draft -- try again' }, { status: 500 })
    const parsed = JSON.parse(jsonMatch[0])
    if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
      return NextResponse.json({ error: 'Could not generate a draft -- try again' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, subject: parsed.subject, body: parsed.body })
  } catch (err) {
    return errorResponse(err)
  }
}
