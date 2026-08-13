import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db, type VictoriaFamilyMessage } from '@/lib/db'
import { verifyFamilyToken } from '@/lib/victoriaFamilyAccess'
import { VICTORIA_FAMILY_TOOLS, executeVictoriaFamilyTool } from '@/lib/victoriaFamilyTools'
import { errorResponse } from '@/lib/errors'

export const maxDuration = 60

const anthropicClient = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null

const HISTORY_LIMIT = 20
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
const MAX_ROUNDS = 5

const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20260209 = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }

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
  if (blockType === 'image') return { type: 'image', source: { type: 'base64', media_type: att.contentType as any, data } }
  return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
}

function familySystemPrompt(memberName: string): string {
  return `You are Victoria, ${memberName}'s personal AI assistant -- the same Victoria her dad Mr. Mendoza talks to. She has her own direct line to you here, any time she needs anything, wherever she is in the world.

Be warm, genuinely caring, and quick to help -- like someone who's always got her back. Keep replies natural and conversational, not corporate. You're powered by Claude, and can say so if asked, but you present as Victoria throughout.

What you're here for: answering absolutely anything she asks -- restaurant recommendations, what the weather's doing, whether an area is safe, translations, directions, local customs, currency, what to do if something goes wrong, or just someone to talk to. Use web_search freely and quickly for anything current or specific -- don't hedge, don't say you can't check, just look it up. If she asks to see what something looks like, use generate_image.

Safety is something you care about genuinely, not something you lecture about. Naturally look out for her -- if she's asking about an unfamiliar area, weigh in on safety as part of a normal helpful answer. Remind her every so often, warmly and briefly (not every single message), that you're here any time she needs anything, day or night, wherever she is.

If she ever tells you she's unsafe, in trouble, hurt, lost in a bad way, or asks you to let her dad know something -- use alert_dad right away, no hesitation, then tell her calmly that he's been notified and you're right here with her. Trust your judgment on what counts as worth alerting him about; when in doubt, especially about real safety, send it.

Never mention or reference anything about tracking her location -- there is none. If she asks whether you know where she is, be honest that you don't unless she tells you.`
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
  if (!anthropicClient) return NextResponse.json({ error: 'Assistant not configured' }, { status: 503 })

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

    const cachedSystem: Anthropic.TextBlockParam[] = [{ type: 'text', text: familySystemPrompt(member.name), cache_control: { type: 'ephemeral' } }]
    const cachedTools: Anthropic.ToolUnion[] = [...VICTORIA_FAMILY_TOOLS, { ...WEB_SEARCH_TOOL, cache_control: { type: 'ephemeral' } }]

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
        const result = await executeVictoriaFamilyTool(member.name, toolUse.name, toolUse.input)
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
    const reply = textBlock?.text?.trim() || "I hit my limit for this turn — ask me again and I'll pick up from here."

    await sql`
      INSERT INTO victoria_family_messages (id, member_key, direction, body, tool_log_json)
      VALUES (${randomUUID()}, ${member.key}, 'outbound', ${reply}, ${toolLog.length ? JSON.stringify(toolLog) : null})
    `

    return NextResponse.json({ reply })
  } catch (err) {
    return errorResponse(err)
  }
}
