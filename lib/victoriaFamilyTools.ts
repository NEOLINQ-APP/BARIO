import type Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { generateImageStandalone, type ImagePurpose } from '@/lib/imageGen'
import { sendSms } from '@/lib/twilio'
import { sendEmail } from '@/lib/email'

// Sherwin's own real cell — same number the VPS voice agent (server.js)
// texts for take_message/take_order/reminders. Hardcoded deliberately, same
// as that file: this is a fixed family safety line, not per-deployment
// config.
const SHERWIN_NUMBER = '+17802410880'

// Family members with the same full personal-assistant access already
// granted on the phone side (miko-voice/server.js's FULL_ACCESS_PERSON_KEYS)
// get the extra tools below (remember_contact/draft_email/send_email) —
// everyone else keeps the smaller generate_image/alert_dad set. Jasmine and
// Scarlett share one phone personKey ('jasmine') since Victoria can't tell
// them apart by caller ID, but have distinct keys here since a web session
// has no such ambiguity — each gets her own contacts.
export const FULL_ACCESS_FAMILY_KEYS = new Set(['mya', 'julianna', 'mom', 'jasmine', 'scarlett'])

// Plain text -> simple HTML paragraphs, same conversion victoriaAppTools.ts
// uses for Sherwin's own draft_email/send_email.
function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
    .join('\n')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The model may pass a real address ("to": "sue@x.com") or just a saved
// contact's name ("to": "Auntie Sue") -- resolve the latter against this
// member's own saved contacts. Never guesses/invents an address.
async function resolveEmailAddress(sql: any, memberKey: string, to: string): Promise<string | null> {
  const trimmed = to.trim()
  if (EMAIL_RE.test(trimmed)) return trimmed
  const rows = (await sql`
    SELECT email FROM victoria_family_contacts
    WHERE member_key = ${memberKey} AND email IS NOT NULL AND name ILIKE ${`%${trimmed}%`}
    ORDER BY created_at DESC LIMIT 1
  `) as { email: string }[]
  return rows[0]?.email ?? null
}

// Victoria's tool set for family members (Mya, Julianna, ...) using their
// own /victoria-family/[member] link -- deliberately much smaller than
// VICTORIA_APP_TOOLS (Sherwin's own app). No invoicing, no marketing, no
// calling/texting arbitrary numbers, no coding/business dispatch -- just
// what a helpful, safety-minded personal assistant needs for someone
// traveling: look things up, show them a picture if asked, and get Dad's
// attention immediately if something's wrong. web_search is added
// separately in the chat route (it's a hosted Anthropic tool, not a
// custom one executed here).
export const VICTORIA_FAMILY_TOOLS: Anthropic.Tool[] = [
  {
    name: 'generate_image',
    description: "Generate a real image from a text description -- use this if she asks to see a picture of something (what a place looks like, an idea, anything visual).",
    input_schema: {
      type: 'object',
      properties: { prompt: { type: 'string', description: 'Detailed description of the image to generate' } },
      required: ['prompt'],
    },
  },
  {
    name: 'alert_dad',
    description: "Immediately text Mr. Mendoza that she needs him -- use this right away whenever she asks you to tell/alert/let her dad know something, or if what she's telling you sounds like a real emergency or she's genuinely unsafe. Don't hesitate or ask permission first, just send it, then tell her it's been sent.",
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: "What to tell him -- her situation, in her own words/context, plus anything useful (where she says she is, what she needs)" },
        urgent: { type: 'boolean', description: 'true for a real emergency/safety concern, false for a lower-key "just let him know" request' },
      },
      required: ['message'],
    },
  },
]

export async function executeVictoriaFamilyTool(
  sql: any,
  memberKey: string,
  memberName: string,
  name: string,
  args: any,
): Promise<any> {
  switch (name) {
    case 'generate_image': {
      try {
        const result = await generateImageStandalone(String(args.prompt ?? ''), 'general' as ImagePurpose)
        return { ok: true, url: result.url }
      } catch (err) {
        console.error('victoria family generate_image failed', err)
        return { error: 'Image generation failed -- try again or rephrase the description.' }
      }
    }
    case 'alert_dad': {
      const urgent = args.urgent !== false
      const prefix = urgent ? `🚨 URGENT from ${memberName}` : `From ${memberName}`
      try {
        await sendSms(SHERWIN_NUMBER, `${prefix}: ${String(args.message ?? '(no message given)')}`)
        return { ok: true, message: 'Sent to Mr. Mendoza right away.' }
      } catch (err) {
        console.error('victoria family alert_dad failed', err)
        return { error: 'Could not send the text -- tell her to try calling him directly if this is urgent.' }
      }
    }
    case 'remember_contact': {
      if (!FULL_ACCESS_FAMILY_KEYS.has(memberKey)) return { error: 'Not available.' }
      const contactName = String(args.name ?? '').trim()
      if (!contactName) return { error: 'Need a name to save this contact.' }
      try {
        await sql`
          INSERT INTO victoria_family_contacts (id, member_key, name, email, phone_number, relationship)
          VALUES (${randomUUID()}, ${memberKey}, ${contactName}, ${args.email ?? null}, ${args.phoneNumber ?? null}, ${args.relationship ?? null})
        `
        return { ok: true, message: `Saved ${contactName}.` }
      } catch (err) {
        console.error('victoria family remember_contact failed', err)
        return { error: 'Could not save that contact — try again.' }
      }
    }
    case 'draft_email': {
      if (!FULL_ACCESS_FAMILY_KEYS.has(memberKey)) return { error: 'Not available.' }
      const to = await resolveEmailAddress(sql, memberKey, String(args.to ?? ''))
      if (!to) return { error: `I don't have an email address for "${args.to}" — ask her for the address, or to save it first.` }
      return { ok: true, preview: { to, subject: String(args.subject ?? ''), body: String(args.body ?? '') } }
    }
    case 'send_email': {
      if (!FULL_ACCESS_FAMILY_KEYS.has(memberKey)) return { error: 'Not available.' }
      const to = await resolveEmailAddress(sql, memberKey, String(args.to ?? ''))
      if (!to) return { error: `I don't have an email address for "${args.to}" — ask her for the address, or to save it first.` }
      try {
        await sendEmail(to, String(args.subject ?? ''), bodyToHtml(String(args.body ?? '')))
        return { ok: true, message: `Sent to ${to}.` }
      } catch (err) {
        console.error('victoria family send_email failed', err)
        return { error: 'Could not send that email — try again.' }
      }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}
