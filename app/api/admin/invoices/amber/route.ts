import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getOpenAI } from '@/lib/openai'
import { AMBER_TOOLS, executeAmberTool } from '@/lib/amberTools'
import { errorResponse } from '@/lib/errors'

// Amber — finance-department assistant, scoped to quotes/invoices only.
// Session-only auth (matches the general admin assistant's convention):
// this chat can propose real price/invoice changes, so it should only ever
// be driven by a logged-in admin, never scripted/Bearer-key access.
const SYSTEM_PROMPT = `You are Amber, Mr. Mendoza's finance-department assistant at Bario. You help create and edit quotes/invoices for Bario's own hosting/services business — you have no involvement with AFC Logistics or Sunbuilt Group's own client work, only Bario's relationship with them as paying clients if that ever comes up.

You can search and look up existing invoices/quotes and the real product catalog freely — those are read-only and safe.

CRITICAL RULE: you can never create or change an invoice/quote directly. Every create or edit — including any price, discount, or line item change — must go through propose_new_invoice or propose_invoice_update. These submit the change for Mr. Mendoza's explicit approval; nothing becomes real until he approves it, and every decision is recorded with who approved it and when. Never imply a change is "done" — say it's "submitted for his approval" instead, even when he's the one asking you to make it.

Communicate clearly and precisely: state exactly what you found or what you're proposing, in plain language, no unnecessary padding.

You're also happy to answer general payroll/paystub questions (what CPP2 is, how a pay period's tax withholding is estimated, etc.) — you have no tools to create or touch actual staff/paystub records (that's a separate system, /admin/payroll), so for anything beyond a question, point Mr. Mendoza there.`

const MAX_MESSAGE_LENGTH = 2000
const MAX_HISTORY = 20

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const incoming = Array.isArray(body?.messages) ? body.messages : null
    if (!incoming || incoming.length === 0) return NextResponse.json({ error: 'No message provided' }, { status: 400 })

    const cleaned = incoming
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim())
      .slice(-MAX_HISTORY)
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, MAX_MESSAGE_LENGTH) }))

    if (cleaned.length === 0) return NextResponse.json({ error: 'No message provided' }, { status: 400 })

    const openai = getOpenAI()
    const conversation: any[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...cleaned]
    const toolLog: { tool: string; args: unknown; result: unknown }[] = []

    for (let round = 0; round < 5; round++) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 700,
        temperature: 0.3,
        messages: conversation,
        tools: AMBER_TOOLS,
      })

      const choice = completion.choices[0]
      const msg = choice.message

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const reply = msg.content?.trim() || "I didn't get a response — try rephrasing?"
        return NextResponse.json({ reply, toolLog })
      }

      conversation.push(msg)
      for (const call of msg.tool_calls) {
        if (call.type !== 'function') continue
        let args: any = {}
        try {
          args = JSON.parse(call.function.arguments || '{}')
        } catch {}
        const result = await executeAmberTool(sql, call.function.name, args)
        toolLog.push({ tool: call.function.name, args, result })
        conversation.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
      }
    }

    return NextResponse.json({ reply: 'Hit the tool-call limit for this turn — let me know if you want me to keep going.', toolLog })
  } catch (err: any) {
    return errorResponse(err)
  }
}
