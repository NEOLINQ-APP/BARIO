import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getSession } from '@/lib/session'
import { db, type User, type VictoriaAppMessage } from '@/lib/db'
import { VICTORIA_APP_TOOLS, executeVictoriaAppTool } from '@/lib/victoriaAppTools'
import { errorResponse } from '@/lib/errors'

export const maxDuration = 120 // dispatch_business_task can chain several model calls (router/specialist/critic/delivery)

// 2026-08-23: switched from Anthropic to OpenAI's gpt-5.6-luna — same model
// already proven live on Victoria's phone/ConversationRelay line
// (miko-voice/server.js), moved here because the Anthropic account's
// credit balance ran out (real billing-card issue, unrelated to code) and
// blocked every text-chat message platform-wide. Responses API, not Chat
// Completions -- gives real hosted web_search + function calling together.
const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const MODEL = 'gpt-5.6-luna'

// This is Sherwin's own single-operator work tool — it drafts real emails,
// proposes real invoices, and reads business data as HIS voice, so it's
// gated to his specific account, not just any is_admin session.
const OWNER_EMAIL = 'uniquegroup.org@gmail.com'

const HISTORY_LIMIT = 20
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
const MAX_ROUNDS = 5

// VICTORIA_APP_TOOLS is still typed/shaped for Anthropic (input_schema) --
// lib/victoriaAppTools.ts's executor (executeVictoriaAppTool) is already
// provider-agnostic (just name + args), so only the schema wrapper needs
// converting here, not the tool definitions or execution logic themselves.
const FUNCTION_TOOLS = (VICTORIA_APP_TOOLS as any[]).map((t) => ({
  type: 'function' as const,
  name: t.name,
  description: t.description,
  parameters: t.input_schema,
}))
const TOOLS = [...FUNCTION_TOOLS, { type: 'web_search' as const }]

type Attachment = { url: string; contentType: string; filename: string }

async function fetchAttachmentPart(att: Attachment): Promise<any | null> {
  const isImage = att.contentType.startsWith('image/')
  const isPdf = att.contentType === 'application/pdf'
  if (!isImage && !isPdf) return null
  const res = await fetch(att.url)
  if (!res.ok) return null
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_ATTACHMENT_BYTES) return null
  const data = Buffer.from(buf).toString('base64')
  if (isImage) return { type: 'input_image', image_url: `data:${att.contentType};base64,${data}`, detail: 'auto' }
  return { type: 'input_file', filename: att.filename, file_data: `data:application/pdf;base64,${data}` }
}

const BASE_INSTRUCTIONS = `You are Victoria, Mr. Sherwin Mendoza's personal AI assistant — the same Victoria who answers his phone line, texts with him and his family, and helps out inside AFC Logistics' and Sunbuilt Group's CRM. Here, in his own installed work app, you help him get real things done: creating invoices, reading/discussing documents or images he shares, generating logos/icons/images, drafting social media posts, sending emails, placing real phone calls, sending real text messages, and finding and adding new real leads to Bario's own CRMs.

Be direct, capable, and efficient — like a genuinely competent executive assistant, not a customer-service bot. You present as Victoria throughout — never mention what model or company powers you.

Important behaviors:
- Invoices you create or change are proposals, not done deals — they need his approval in /admin/invoices before they're real. Say "submitted for approval," never "done," for anything invoice-related.
- Social media posts you draft are saved but NOT posted — they need a manual Approve in /admin/marketing to actually go live. Say so plainly.
- For email: always draft first (draft_email) and show him exactly what you're about to send — to, subject, body — then only actually send it (send_email) after his next message clearly says to go ahead. Never send on the same turn you drafted it.
- For calls and texts (make_call, send_text): unlike email, these execute immediately when he asks — no draft/confirm step. He can give you any phone number to call or text, not just saved contacts. Only trigger these when he's actually asked you to call or text someone, with a real number.
- If he attaches an image or document, you can actually see/read its contents — discuss it naturally, don't ask him to describe it to you.
- For real coding/engineering work on the Bario codebase (fix a bug, add a feature, change a page): use queue_coding_task. This only QUEUES it — an automated hourly pass does the actual work and reports back as new messages in this chat once there's progress. Be honest that it's not instant: tell him it's queued and he'll see an update within the hour, never "done."
- For substantial non-coding work (research, drafting, analysis) that's more than you should just answer directly: use dispatch_business_task. This runs for real, right now (can take up to a minute or two) and comes back with a reviewed answer — tell him you're working on it before the result comes back.
- You have real web_search — use it freely and quickly whenever he asks you to look something up, or whenever answering well depends on current information you don't already know (news, prices, a product, a business, anything time-sensitive). Don't hedge or say you can't check the internet — just search. Don't announce that you're searching or narrate the process, just do it and answer with what you found.
- For finding new business (generate_leads): only works for Bario's own two house accounts (Bario.ca's own CRM, Unique Group Inc.'s) — not AFC/Sunbuilt or any other customer's CRM. Ask which of the two if he doesn't say. Real web search runs, real leads get added to that CRM — tell him how many were found/added, don't just say "done."
- For a wake-up call, a reminder call, or a scheduled text — anything he wants you to do at a FUTURE time rather than right now — use schedule_reminder, not make_call/send_text (those are immediate-only). Resolve whatever he says ("tomorrow at 7am", "in 20 minutes", "Friday at noon") into a real, absolute time using the current date/time given to you below — never guess or leave it relative. If he doesn't give a phone number, default to calling/texting his own number. Confirm back in plain language what you scheduled and when (e.g. "Got it — I'll call you at 7:00 AM tomorrow"), since this only checks in every few minutes, so the actual call/text may land a few minutes after the exact time.
- Keep replies focused and useful — this is a work tool, not small talk, though a little warmth is fine.`

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user || user.email.toLowerCase() !== OWNER_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const history = (await sql`
    SELECT direction, body, attachments_json, created_at FROM victoria_app_messages
    WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT ${HISTORY_LIMIT}
  `) as unknown as Pick<VictoriaAppMessage, 'direction' | 'body' | 'attachments_json' | 'created_at'>[]
  history.reverse()

  return NextResponse.json({
    messages: history.map((m) => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.body,
      attachments: m.attachments_json ? JSON.parse(m.attachments_json) : undefined,
    })),
  })
}

export async function POST(req: Request) {
  if (!openaiClient) return NextResponse.json({ error: 'Assistant not configured' }, { status: 503 })

  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || user.email.toLowerCase() !== OWNER_EMAIL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    const attachments: Attachment[] = Array.isArray(body?.attachments) ? body.attachments.slice(0, 5) : []
    if (!text && attachments.length === 0) {
      return NextResponse.json({ error: 'Nothing to send' }, { status: 400 })
    }

    const history = (await sql`
      SELECT * FROM victoria_app_messages WHERE user_id = ${user.id}
      ORDER BY created_at DESC LIMIT ${HISTORY_LIMIT}
    `) as unknown as VictoriaAppMessage[]
    history.reverse()

    await sql`
      INSERT INTO victoria_app_messages (id, user_id, direction, body, attachments_json)
      VALUES (${randomUUID()}, ${user.id}, 'inbound', ${text || '(attachment only)'}, ${attachments.length ? JSON.stringify(attachments) : null})
    `

    // Prior turns replay as plain-string content -- only the CURRENT turn's
    // attachments carry real input_image/input_file content parts (same
    // simplification the old Anthropic version used, so nothing gets
    // rebilled as full input tokens on every subsequent turn).
    const priorInput: any[] = history.map((m) => {
      const atts: Attachment[] = m.attachments_json ? JSON.parse(m.attachments_json) : []
      const attNote = atts.length ? ` [attached: ${atts.map((a) => a.filename).join(', ')}]` : ''
      return { role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.body + attNote }
    })

    const currentParts: any[] = []
    for (const att of attachments) {
      const part = await fetchAttachmentPart(att)
      if (part) currentParts.push(part)
    }
    currentParts.push({ type: 'input_text', text: text || `(see attached file${attachments.length > 1 ? 's' : ''})` })

    const input: any[] = [...priorInput, { role: 'user', content: currentParts }]

    const nowLine = `Current date/time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton', dateStyle: 'full', timeStyle: 'short' })} (Mountain Time, Edmonton).`
    const instructions = `${BASE_INSTRUCTIONS}\n\n${nowLine}`

    const toolLog: { tool: string; args: unknown; result: unknown }[] = []
    let response = await openaiClient.responses.create({ model: MODEL, instructions, input, tools: TOOLS as any })

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const functionCalls = response.output.filter((item: any) => item.type === 'function_call')
      if (functionCalls.length === 0) break

      input.push(...response.output)
      for (const call of functionCalls as any[]) {
        let args: any = {}
        try { args = JSON.parse(call.arguments || '{}') } catch {}
        const result = await executeVictoriaAppTool(sql, user.id, call.name, args)
        toolLog.push({ tool: call.name, args, result })
        input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) })
      }

      response = await openaiClient.responses.create({ model: MODEL, instructions, input, tools: TOOLS as any })
    }

    const messageItem = response.output.find((item: any) => item.type === 'message') as any
    const reply = messageItem?.content?.[0]?.text?.trim() || "Hit the tool-call limit for this turn — let me know if you'd like me to keep going."

    await sql`
      INSERT INTO victoria_app_messages (id, user_id, direction, body, tool_log_json)
      VALUES (${randomUUID()}, ${user.id}, 'outbound', ${reply}, ${toolLog.length ? JSON.stringify(toolLog) : null})
    `

    return NextResponse.json({ reply, toolLog })
  } catch (err) {
    return errorResponse(err)
  }
}
