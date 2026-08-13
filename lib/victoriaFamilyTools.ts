import type Anthropic from '@anthropic-ai/sdk'
import { generateImageStandalone, type ImagePurpose } from '@/lib/imageGen'
import { sendSms } from '@/lib/twilio'

// Sherwin's own real cell — same number the VPS voice agent (server.js)
// texts for take_message/take_order/reminders. Hardcoded deliberately, same
// as that file: this is a fixed family safety line, not per-deployment
// config.
const SHERWIN_NUMBER = '+17802410880'

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

export async function executeVictoriaFamilyTool(memberName: string, name: string, args: any): Promise<any> {
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
    default:
      return { error: `Unknown tool: ${name}` }
  }
}
