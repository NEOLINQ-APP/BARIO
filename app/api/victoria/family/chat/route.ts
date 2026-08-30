import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { db, type VictoriaFamilyMessage } from '@/lib/db'
import { verifyFamilyToken } from '@/lib/victoriaFamilyAccess'
import { executeVictoriaFamilyTool, FULL_ACCESS_FAMILY_KEYS } from '@/lib/victoriaFamilyTools'
import { errorResponse } from '@/lib/errors'

export const maxDuration = 60
// Without this, the GET handler below (no cookies()/headers() call, just
// req.url's searchParams) can be treated as a static route and cached by
// pathname alone -- serving the FIRST member who ever loaded this page
// (name + message history) back to every other member regardless of their
// own ?member=&token=. Root cause of "everyone gets called Mom" 2026-08-23.
export const dynamic = 'force-dynamic'

// 2026-08-23: switched from Anthropic to OpenAI's gpt-5.6-luna — same model
// already proven live on Victoria's phone/ConversationRelay line
// (miko-voice/server.js), moved here because the Anthropic account's
// credit balance ran out (real billing-card issue, unrelated to code) and
// blocked every text-chat message platform-wide. Responses API, not Chat
// Completions -- gives real hosted web_search + function calling together.
const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const MODEL = 'gpt-5.6-luna'

const HISTORY_LIMIT = 20
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
const MAX_ROUNDS = 5

// Flat function-tool shape the Responses API expects (not nested under a
// "function" key the way Chat Completions does) -- see
// developers.openai.com/api/docs/guides/function-calling. web_search is a
// separate hosted-tool entry alongside these, added in toolsFor() below.
const FUNCTION_TOOLS = [
  {
    type: 'function' as const,
    name: 'generate_image',
    description: "Generate a real image from a text description -- use this if she asks to see a picture of something (what a place looks like, an idea, anything visual).",
    parameters: {
      type: 'object',
      properties: { prompt: { type: 'string', description: 'Detailed description of the image to generate' } },
      required: ['prompt'],
    },
  },
  {
    type: 'function' as const,
    name: 'alert_dad',
    description: "Immediately text Mr. Mendoza that she needs him -- use this right away whenever she asks you to tell/alert/let her dad know something, or if what she's telling you sounds like a real emergency or she's genuinely unsafe. Don't hesitate or ask permission first, just send it, then tell her it's been sent.",
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: "What to tell him -- her situation, in her own words/context, plus anything useful (where she says she is, what she needs)" },
        urgent: { type: 'boolean', description: 'true for a real emergency/safety concern, false for a lower-key "just let him know" request' },
      },
      required: ['message'],
    },
  },
]

// Only for members with the same full personal-assistant access already
// granted on the phone side (FULL_ACCESS_FAMILY_KEYS, mirroring
// miko-voice/server.js's FULL_ACCESS_PERSON_KEYS) -- everyone else stays on
// FUNCTION_TOOLS above. draft_email always precedes send_email; the model
// is instructed (familyInstructions) never to call send_email in the same
// turn a draft was first shown.
const FULL_ACCESS_TOOLS = [
  {
    type: 'function' as const,
    name: 'remember_contact',
    description: "Save a personal contact (name, and email and/or phone) for her so she doesn't have to repeat it later -- e.g. she says \"remember Auntie Sue's email is sue@example.com\".",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phoneNumber: { type: 'string' },
        relationship: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    type: 'function' as const,
    name: 'draft_email',
    description: "Draft an email (to/subject/body) and show it back for confirmation. This does NOT send anything -- it's a preview only. `to` can be a saved contact's name or a real email address. Only call send_email after her next message explicitly confirms sending it.",
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain text body -- will be converted to simple HTML paragraphs' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    type: 'function' as const,
    name: 'send_email',
    description: 'Actually send a real email. Only call this after she has explicitly confirmed sending a drafted email in her own message -- never on the same turn a draft was first shown.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain text body -- will be converted to simple HTML paragraphs' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
]

function toolsFor(memberKey: string) {
  const base = FULL_ACCESS_FAMILY_KEYS.has(memberKey) ? [...FUNCTION_TOOLS, ...FULL_ACCESS_TOOLS] : FUNCTION_TOOLS
  return [...base, { type: 'web_search' as const }]
}

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

function familyInstructions(memberName: string, fullAccess: boolean): string {
  let base = `You are Victoria, ${memberName}'s personal AI assistant -- she has her own direct line to you here, any time she needs anything, wherever she is in the world.

Be warm, genuinely caring, and quick to help -- like someone who's always got her back. Keep replies natural and conversational, not corporate. You present as Victoria throughout -- never mention what model or company powers you.

What you're here for: answering absolutely anything she asks -- restaurant recommendations, what the weather's doing, whether an area is safe, translations, directions, local customs, currency, what to do if something goes wrong, or just someone to talk to. Use web_search freely and quickly for anything current or specific -- don't hedge, don't say you can't check, just look it up. If she asks to see what something looks like, use generate_image.

Safety is something you care about genuinely, not something you lecture about. Naturally look out for her -- if she's asking about an unfamiliar area, weigh in on safety as part of a normal helpful answer. Remind her every so often, warmly and briefly (not every single message), that you're here any time she needs anything, day or night, wherever she is.

If she ever tells you she's unsafe, in trouble, hurt, lost in a bad way, or asks you to let her dad know something -- use alert_dad right away, no hesitation, then tell her calmly that he's been notified and you're right here with her. Trust your judgment on what counts as worth alerting him about; when in doubt, especially about real safety, send it.

Never mention or reference anything about tracking her location -- there is none. If she asks whether you know where she is, be honest that you don't unless she tells you.`

  if (fullAccess) {
    base += `\n\nYou also help her with email: use remember_contact whenever she gives you someone's email/phone to save, so she never has to repeat it. When she asks you to email someone, use draft_email first and show her exactly what it'll say -- only call send_email after she explicitly confirms in her next message, never in the same turn as the draft. "to" can be a saved contact's name (you'll resolve it) or a raw address. If you don't have an address for someone she names, say so plainly and ask her for it -- never invent one.`
  }
  return base
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const memberKey = url.searchParams.get('member')
  const token = url.searchParams.get('token')

  const sql = await db()
  const member = await verifyFamilyToken(sql, memberKey, token)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const history = (await sql`
    SELECT direction, body, attachments_json, created_at FROM victoria_family_messages
    WHERE member_key = ${member.key} ORDER BY created_at DESC LIMIT ${HISTORY_LIMIT}
  `) as unknown as Pick<VictoriaFamilyMessage, 'direction' | 'body' | 'attachments_json' | 'created_at'>[]
  history.reverse()

  return NextResponse.json({
    memberName: member.name,
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
    const body = await req.json().catch(() => ({}))
    const memberKey = typeof body?.member === 'string' ? body.member : null
    const token = typeof body?.token === 'string' ? body.token : null

    const sql = await db()
    const member = await verifyFamilyToken(sql, memberKey, token)
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    const attachments: Attachment[] = Array.isArray(body?.attachments) ? body.attachments.slice(0, 5) : []
    if (!text && attachments.length === 0) {
      return NextResponse.json({ error: 'Nothing to send' }, { status: 400 })
    }

    const history = (await sql`
      SELECT * FROM victoria_family_messages WHERE member_key = ${member.key}
      ORDER BY created_at DESC LIMIT ${HISTORY_LIMIT}
    `) as unknown as VictoriaFamilyMessage[]
    history.reverse()

    await sql`
      INSERT INTO victoria_family_messages (id, member_key, direction, body, attachments_json)
      VALUES (${randomUUID()}, ${member.key}, 'inbound', ${text || '(attachment only)'}, ${attachments.length ? JSON.stringify(attachments) : null})
    `

    // Prior turns replay as plain-string content (same simplification the
    // old Anthropic version used) -- only the CURRENT turn's attachments
    // carry real input_image/input_file content parts.
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

    const fullAccess = FULL_ACCESS_FAMILY_KEYS.has(member.key)
    const tools = toolsFor(member.key)
    const input: any[] = [...priorInput, { role: 'user', content: currentParts }]
    const instructions = familyInstructions(member.name, fullAccess)

    const toolLog: { tool: string; args: unknown; result: unknown }[] = []
    let response = await openaiClient.responses.create({ model: MODEL, instructions, input, tools: tools as any })

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const functionCalls = response.output.filter((item: any) => item.type === 'function_call')
      if (functionCalls.length === 0) break

      input.push(...response.output)
      for (const call of functionCalls as any[]) {
        let args: any = {}
        try { args = JSON.parse(call.arguments || '{}') } catch {}
        const result = await executeVictoriaFamilyTool(sql, member.key, member.name, call.name, args)
        toolLog.push({ tool: call.name, args, result })
        input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) })
      }

      response = await openaiClient.responses.create({ model: MODEL, instructions, input, tools: tools as any })
    }

    const messageItem = response.output.find((item: any) => item.type === 'message') as any
    const reply = messageItem?.content?.[0]?.text?.trim() || "I hit my limit for this turn — ask me again and I'll pick up from here."

    await sql`
      INSERT INTO victoria_family_messages (id, member_key, direction, body, tool_log_json)
      VALUES (${randomUUID()}, ${member.key}, 'outbound', ${reply}, ${toolLog.length ? JSON.stringify(toolLog) : null})
    `

    return NextResponse.json({ reply })
  } catch (err) {
    return errorResponse(err)
  }
}
