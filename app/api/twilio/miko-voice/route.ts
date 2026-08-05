import { NextResponse } from 'next/server'
import { DIALER_BUSINESSES } from '@/lib/dialerBusinesses'
import { VICTORIA_GREETINGS, buildVictoriaConnectTwiml } from '@/lib/victoriaTwiml'
import { db, type VoiceAgentConfig } from '@/lib/db'

// TwiML for the three Bario-owned numbers Victoria is involved with: her
// own dedicated number (+18254650880, and Unique Group's real number),
// plus AFC Logistics' (+18253607175) and Sunbuilt Group's (+18254352121)
// real public numbers. Routes to Twilio's ConversationRelay, which opens a
// WebSocket to miko-voice.bario.ca (a small always-on Node service on the
// main VPS, not part of this Next.js app — WebSockets need a persistent
// connection Vercel serverless functions can't hold).
//
// 2026-08-04: AFC and Sunbuilt asked to go back to their real cell ringing
// FIRST (how it worked before Victoria existed), with Victoria only
// picking up as a missed-call fallback — not answering first the way she
// still does for Unique Group's own line. See
// app/api/twilio/miko-voice/dial-fallback/route.ts for the second half of
// that flow (what happens once the <Dial> below resolves).
const FORWARD_FIRST_KEYS = new Set(['afc', 'sunbuilt'])

// How long the owner's real cell rings before Victoria takes over. No
// stated requirement from the business — 20s is a reasonable "give a real
// person a chance to grab their phone" default, easy to tune later.
const FORWARD_RING_SECONDS = 20

export async function POST(req: Request) {
  let to = ''
  try {
    const form = await req.formData()
    to = String(form.get('To') ?? '')
  } catch {
    // Malformed/empty body — fall through to the default Unique Group greeting.
  }

  // Checked FIRST and left byte-for-byte identical to before this change —
  // AFC/Sunbuilt/Unique never reach the DB-backed branch below, so a bug in
  // the new reseller product can't touch their live phone lines.
  const business = DIALER_BUSINESSES.find((b) => b.twilioNumber === to)

  if (business && FORWARD_FIRST_KEYS.has(business.key)) {
    const fallbackUrl = `https://www.bario.ca/api/twilio/miko-voice/dial-fallback?business=${business.key}`
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${business.twilioNumber}" timeout="${FORWARD_RING_SECONDS}" action="${fallbackUrl}">
    <Number>${business.forwardToNumber}</Number>
  </Dial>
</Response>`
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } })
  }

  if (!business) {
    // Voice Agent reseller customers (app/(account)/dashboard/voice-agent)
    // — same forward-first-then-Victoria-fallback shape as AFC/Sunbuilt
    // above, just data-driven instead of hardcoded, since every one of
    // these orders is that exact product by definition.
    const sql = await db()
    const rows = (await sql`SELECT * FROM voice_agent_configs WHERE twilio_number = ${to}`) as unknown as VoiceAgentConfig[]
    const config = rows[0]
    if (config) {
      const fallbackUrl = `https://www.bario.ca/api/twilio/miko-voice/dial-fallback?configId=${config.id}`
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${config.twilio_number}" timeout="${FORWARD_RING_SECONDS}" action="${fallbackUrl}">
    <Number>${config.forward_to_number}</Number>
  </Dial>
</Response>`
      return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } })
    }
  }

  const greeting = (business && VICTORIA_GREETINGS[business.key]) ?? VICTORIA_GREETINGS.unique
  return new NextResponse(buildVictoriaConnectTwiml(greeting), { headers: { 'Content-Type': 'text/xml' } })
}
