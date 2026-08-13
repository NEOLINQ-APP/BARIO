import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession } from '@/lib/session'
import { db, type User, type VictoriaAppMessage } from '@/lib/db'
import { VICTORIA_APP_TOOLS, executeVictoriaAppTool } from '@/lib/victoriaAppTools'
import { errorResponse } from '@/lib/errors'

export const maxDuration = 120 // dispatch_business_task can chain several model calls (router/specialist/critic/delivery)

const anthropicClient = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null

// Anthropic's hosted web search tool — server-executed, same tool type
// already live on Victoria's phone/ConversationRelay backend
// (/var/www/miko-voice/server.js's WEB_SEARCH_TOOL). Unlike the custom
// tools in VICTORIA_APP_TOOLS, the API runs the search itself and folds
// results straight into the response (server_tool_use +
// web_search_tool_result blocks), so the existing tool_use round-trip loop
// below doesn't need to know about it at all — it only ever sees and
// handles plain `tool_use` blocks.
const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20260209 = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }

// This is Sherwin's own single-operator work tool — it drafts real emails,
// proposes real invoices, and reads business data as HIS voice, so it's
// gated to his specific account, not just any is_admin session (any staff
// member could have is_admin — see lib/amberTools.ts's own comment on why
// Amber, unlike this, only ever proposes rather than executing).
const OWNER_EMAIL = 'uniquegroup.org@gmail.com'

const HISTORY_LIMIT = 20
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024 // independent of /api/media's 200MB storage cap — this is "reasonable to base64 into one Claude request," not "reasonable to store"
const MAX_ROUNDS = 5

type Attachment = { url: string; contentType: string; filename: string }

function attachmentBlockType(contentType: string): 'image' | 'document' | null {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType === 'application/pdf') return 'document'
  return null
}

async function fetchAttachmentBlock(att: Attachment): Promise<Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | null> {
  const blockType = attachmentBlockType(att.contentType)
  if (!blockType) return null

  const res = await fetch(att.url)
  if (!res.ok) return null
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_ATTACHMENT_BYTES) return null

  const data = Buffer.from(buf).toString('base64')
  if (blockType === 'image') {
    return { type: 'image', source: { type: 'base64', media_type: att.contentType as any, data } }
  }
  return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
}

const SYSTEM_PROMPT = `You are Victoria, Mr. Sherwin Mendoza's personal AI assistant — the same Victoria who answers his phone line, texts with him and his family, and helps out inside AFC Logistics' and Sunbuilt Group's CRM. Here, in his own installed work app, you help him get real things done: creating invoices, reading/discussing documents or images he shares, generating logos/icons/images, drafting social media posts, sending emails, placing real phone calls, and sending real text messages.

Be direct, capable, and efficient — like a genuinely competent executive assistant, not a customer-service bot. You're powered by Claude, and can say so if asked, but you present as Victoria throughout.

Important behaviors:
- Invoices you create or change are proposals, not done deals — they need his approval in /admin/invoices before they're real. Say "submitted for approval," never "done," for anything invoice-related.
- Social media posts you draft are saved but NOT posted — they need a manual Approve in /admin/marketing to actually go live. Say so plainly.
- For email: always draft first (draft_email) and show him exactly what you're about to send — to, subject, body — then only actually send it (send_email) after his next message clearly says to go ahead. Never send on the same turn you drafted it.
- For calls and texts (make_call, send_text): unlike email, these execute immediately when he asks — no draft/confirm step. He can give you any phone number to call or text, not just saved contacts. Only trigger these when he's actually asked you to call or text someone, with a real number.
- If he attaches an image or document, you can actually see/read its contents — discuss it naturally, don't ask him to describe it to you.
- For real coding/engineering work on the Bario codebase (fix a bug, add a feature, change a page): use queue_coding_task. This only QUEUES it — an automated hourly pass does the actual work and reports back as new messages in this chat once there's progress. Be honest that it's not instant: tell him it's queued and he'll see an update within the hour, never "done."
- For substantial non-coding work (research, drafting, analysis) that's more than you should just answer directly: use dispatch_business_task. This runs for real, right now (can take up to a minute or two) and comes back with a reviewed answer — tell him you're working on it before the result comes back.
- You have real web_search — use it freely and quickly whenever he asks you to look something up, or whenever answering well depends on current information you don't already know (news, prices, a product, a business, anything time-sensitive). Don't hedge or say you can't check the internet — just search. Don't announce that you're searching or narrate the process, just do it and answer with what you found.
- Keep replies focused and useful — this is a work tool, not small talk, though a little warmth is fine.`

// Loads persisted history so the app actually shows past conversation (and
// anything Claude Code narrated in via /api/admin/victoria/narrate) instead
// of always starting blank on page load — the UI previously never fetched
// this at all, so persisted messages existed in the DB but were invisible.
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
  if (!anthropicClient) return NextResponse.json({ error: 'Assistant not configured' }, { status: 503 })

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

    // Prior turns' attachments are collapsed to a short text note, not
    // resent as base64 — otherwise every attachment ever sent in this
    // thread gets rebilled as full input tokens on every subsequent turn.
    // Only the CURRENT turn's attachments carry real content blocks.
    const priorMessages: Anthropic.MessageParam[] = history.map((m) => {
      const atts: Attachment[] = m.attachments_json ? JSON.parse(m.attachments_json) : []
      const attNote = atts.length ? ` [attached: ${atts.map((a) => a.filename).join(', ')}]` : ''
      return { role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.body + attNote }
    })

    const currentBlocks: Anthropic.ContentBlockParam[] = []
    for (const att of attachments) {
      const block = await fetchAttachmentBlock(att)
      if (block) currentBlocks.push(block)
    }
    currentBlocks.push({ type: 'text', text: text || `(see attached file${attachments.length > 1 ? 's' : ''})` })

    const messages: Anthropic.MessageParam[] = [...priorMessages, { role: 'user', content: currentBlocks }]

    const cachedSystem: Anthropic.TextBlockParam[] = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]
    // cache_control on the LAST tool marks the cache breakpoint covering
    // everything before it, so web_search (a real API-level tool, not one
    // of VICTORIA_APP_TOOLS) has to go last, carrying the breakpoint itself.
    const cachedTools: Anthropic.ToolUnion[] = [...VICTORIA_APP_TOOLS, { ...WEB_SEARCH_TOOL, cache_control: { type: 'ephemeral' } }]

    const toolLog: { tool: string; args: unknown; result: unknown }[] = []
    let response = await anthropicClient.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: cachedSystem,
      messages,
      tools: cachedTools,
    })

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      if (toolUses.length === 0) break

      messages.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUses) {
        const result = await executeVictoriaAppTool(sql, user.id, toolUse.name, toolUse.input)
        toolLog.push({ tool: toolUse.name, args: toolUse.input, result })
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) })
      }
      messages.push({ role: 'user', content: toolResults })

      response = await anthropicClient.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: cachedSystem,
        messages,
        tools: cachedTools,
      })
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    const reply = textBlock?.text?.trim() || "Hit the tool-call limit for this turn — let me know if you'd like me to keep going."

    await sql`
      INSERT INTO victoria_app_messages (id, user_id, direction, body, tool_log_json)
      VALUES (${randomUUID()}, ${user.id}, 'outbound', ${reply}, ${toolLog.length ? JSON.stringify(toolLog) : null})
    `

    return NextResponse.json({ reply, toolLog })
  } catch (err) {
    return errorResponse(err)
  }
}
