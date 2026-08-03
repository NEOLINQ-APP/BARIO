import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db, type VictoriaMessage } from '@/lib/db'

const anthropicClient = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null

// Victoria's own number's known family contacts — a small, hardcoded map
// rather than reading the VPS's personal.json (that file lives on a
// different box than this Next.js deployment, with no shared filesystem).
// Keep this in sync with /var/www/miko-voice/personal.json's contacts by
// hand if numbers ever change.
const FAMILY: Record<string, string> = {
  '+17802410880': 'Mr. Mendoza',
  '+17809079755': 'Mya',
  '+18254592955': 'Juliana',
}

const HISTORY_LIMIT = 20

function normalize(raw: string): string {
  // Twilio prefixes WhatsApp senders as "whatsapp:+1XXXXXXXXXX" — strip that
  // so the same phone number is recognized (and gets the same memory/thread)
  // whether it texts over SMS or WhatsApp.
  return raw.replace(/^whatsapp:/, '').replace(/[^0-9+]/g, '')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function twiml(message: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

const CREATE_APPOINTMENT_TOOL: Anthropic.Tool = {
  name: 'create_appointment',
  description:
    "Add an appointment/reminder to Mr. Mendoza's personal calendar and schedule an SMS reminder ahead of it. datetime must be a specific date and time resolved from what he says (convert relative phrasing like 'tomorrow at 3pm' to a real ISO 8601 datetime using today's real date/time).",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      datetime: { type: 'string', description: 'ISO 8601 datetime, e.g. 2026-08-05T15:00:00-06:00' },
      reminderMinutesBefore: { type: 'number', description: 'Minutes before the appointment to send a reminder text. Defaults to 30.' },
    },
    required: ['title', 'datetime'],
  },
}

// Same personal.json store the voice line's own create_appointment tool
// writes to (and its existing minute-by-minute reminder scanner already
// reads from) — reached over HTTP since this Next.js deployment and the
// VPS running miko-voice are separate machines with no shared filesystem.
async function createAppointmentOnVps(title: string, datetime: string, reminderMinutesBefore?: number): Promise<boolean> {
  const secret = process.env.INTERNAL_API_SECRET
  if (!secret) {
    console.error('createAppointmentOnVps: INTERNAL_API_SECRET not set')
    return false
  }
  // One retry — a couple of test runs saw an occasional transient failure
  // reaching the VPS (no error logged server-side, so likely a cold
  // connection), and this is family-facing enough to be worth a quick
  // second attempt rather than surfacing "try again" to a real person.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://miko-voice.bario.ca/internal/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
        body: JSON.stringify({ title, datetime, reminderMinutesBefore }),
      })
      if (res.ok) return true
      console.error('createAppointmentOnVps failed', attempt, res.status, await res.text().catch(() => ''))
    } catch (err) {
      console.error('createAppointmentOnVps threw', attempt, err)
    }
  }
  return false
}

// Inbound SMS/WhatsApp webhook for Victoria's number (+18254650880) — lets
// Mr. Mendoza and his family text her (either channel — Twilio mirrors the
// TwiML reply back on whichever channel the inbound message arrived on) and
// get a real, remembered reply, instead of a text just landing with no
// response. Every message (both directions) is logged to victoria_messages
// so she has real continuity across a conversation, not a blank slate every
// text.
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const rawFrom = String(form.get('From') ?? '')
    const from = normalize(rawFrom)
    const channel = rawFrom.startsWith('whatsapp:') ? 'whatsapp' : 'sms'
    const body = String(form.get('Body') ?? '').trim()

    if (!body) return twiml("Didn't catch that — try texting again?")

    const sql = await db()
    const history = (await sql`
      SELECT * FROM victoria_messages WHERE phone_number = ${from}
      ORDER BY created_at DESC LIMIT ${HISTORY_LIMIT}
    `) as unknown as VictoriaMessage[]
    history.reverse()

    await sql`
      INSERT INTO victoria_messages (id, phone_number, channel, direction, body)
      VALUES (${randomUUID()}, ${from}, ${channel}, 'inbound', ${body})
    `

    const knownName = FAMILY[from]
    if (!anthropicClient) {
      return twiml(knownName ? `Hi ${knownName}, got your message! (I'm having a technical hiccup replying properly right now.)` : 'Got your message!')
    }

    const isSherwin = knownName === 'Mr. Mendoza'
    // The whole family (Mr. Mendoza, Maya, Juliana) can reach Victoria and
    // have her schedule things any time — this is a shared family calendar,
    // not owner-only. Anyone outside these known contacts still can't.
    const canSchedule = !!knownName
    // Same real-date-grounding approach as the voice line (server.js) —
    // a bare UTC ISO timestamp isn't enough: real testing here produced a
    // wrong day ("this Friday" resolved to the wrong date) since the model
    // has to do its own day-of-week arithmetic from a raw timestamp.
    // Spelling out the actual weekday name in Mountain Time removes that
    // guesswork. This block is deliberately kept OUT of the cached system
    // block below (see cachedSystem) since it changes on every request —
    // caching it alongside the static instructions would defeat caching
    // entirely (a new "cached" entry every single text, never a hit).
    const nowInEdmonton = new Date().toLocaleString('en-CA', { timeZone: 'America/Edmonton', dateStyle: 'full', timeStyle: 'short' })
    const staticInstructions = `You are Victoria, the Mendoza family's personal AI assistant, texting over ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}. ${
      isSherwin
        ? "You're texting with Mr. Mendoza himself — your owner/handler. Be warm, direct, and helpful."
        : knownName
        ? `You're texting with ${knownName}, one of Mr. Mendoza's daughters. Be warm, caring, and a little affectionate — like family, not a call center. He often has you pass along love/goodnight messages to his kids.`
        : "You're texting with someone not in your known contacts. Be polite and brief, and don't assume who they are — ask if it's relevant."
    }${
      canSchedule
        ? ' Use the create_appointment tool naturally when asked to schedule or remind about something, then confirm back in plain language what you saved.'
        : ''
    } You have a real memory of this conversation thread (see message history) — refer back to things naturally when relevant, the way a person who remembers past texts would. Keep replies SHORT — this is a text message, not a phone call. No more than 2-3 sentences.`
    const dateGrounding = `The real current date and time right now is: ${nowInEdmonton} (America/Edmonton time). Always resolve relative dates/times (like "tomorrow" or "next Friday at 3") against this real date, never against any other assumption — double-check day-of-week arithmetic carefully rather than guessing.`

    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({ role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.body })),
      { role: 'user' as const, content: body },
    ]

    // Prompt caching: staticInstructions (and the tool schema, when offered)
    // are identical across every text in this thread and every other
    // thread — marking them cacheable means repeat reads cost a fraction
    // of full input-token price. dateGrounding is a separate, UNCACHED
    // trailing block since it changes on every request.
    const cachedSystem: Anthropic.TextBlockParam[] = [
      { type: 'text', text: staticInstructions, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dateGrounding },
    ]
    const cachedTools = canSchedule ? [{ ...CREATE_APPOINTMENT_TOOL, cache_control: { type: 'ephemeral' as const } }] : undefined

    let response = await anthropicClient.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 300,
      system: cachedSystem,
      messages,
      tools: cachedTools,
    })

    // Any known family member can create appointments (shared family
    // calendar) — anyone outside FAMILY still can't, since canSchedule is
    // false for them and the tool was never offered.
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (canSchedule && toolUse?.name === 'create_appointment') {
      const input = toolUse.input as { title: string; datetime: string; reminderMinutesBefore?: number }
      const ok = await createAppointmentOnVps(input.title, input.datetime, input.reminderMinutesBefore)

      response = await anthropicClient.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 300,
        system: cachedSystem,
        messages: [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: ok ? 'Saved.' : 'Failed to save — tell him something went wrong.' }] },
        ],
      })
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    const reply = textBlock?.text?.trim() || 'Got it!'

    await sql`
      INSERT INTO victoria_messages (id, phone_number, channel, direction, body)
      VALUES (${randomUUID()}, ${from}, ${channel}, 'outbound', ${reply})
    `

    return twiml(reply)
  } catch (err) {
    console.error('miko-sms error', err)
    return twiml('Sorry, I had trouble replying just now — try again in a bit?')
  }
}
