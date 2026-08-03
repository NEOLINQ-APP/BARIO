import { NextResponse } from 'next/server'

// TwiML for Victoria's shared AI-receptionist line — now answers inbound
// calls for three different Bario-owned numbers, not just Unique Group's
// own: her own dedicated number (+18254650880), and now also AFC
// Logistics' (+18253607175) and Sunbuilt Group's (+18254352121) real
// public numbers, each previously configured to forward straight to the
// owner's cell — Victoria now answers first, and greets/represents
// whichever company's number was actually dialed. Routes the call to
// Twilio's ConversationRelay, which opens a WebSocket to miko-voice.bario.ca
// (a small always-on Node service on the main VPS, not part of this
// Next.js app — WebSockets need a persistent connection Vercel serverless
// functions can't hold). The `To` number is passed straight through so the
// WebSocket server's setup handler can key off it the same way it already
// keys off `from` for caller recognition. The `action` URL is called once
// the ConversationRelay session ends, carrying whatever handoffData
// Victoria set (e.g. "transfer me to AFC Logistics") — see
// app/api/twilio/victoria-handoff/route.ts for what happens next.
const GREETINGS: Record<string, string> = {
  '+18253607175': 'Hi, thank you for calling AFC Logistics! This is Victoria, how may I help you today?',
  '+18254352121': 'Hi, thank you for calling Sunbuilt Group! This is Victoria, how may I help you today?',
}
const DEFAULT_GREETING = 'Hi, thank you for calling Unique Group! This is Victoria, how may I help you today?'

// Reverted to a single flat voice (no nested <Language> tags) as an
// emergency fix — a real user report came in that Victoria sounded male
// after the multi-language <Language>-tag restructuring, and this exact
// flat-attribute shape (ttsProvider/voice directly on <ConversationRelay>)
// is the one previously confirmed live to sound correct. The nested
// <Language> multi-voice syntax needs re-verification against a real call
// before it's reintroduced — see PENDING note in miko-voice server.js
// about multi-language support being temporarily voice-switch-only
// (transcription language still switches, but TTS stays on this one voice
// until the nested-tag approach is confirmed safe).
export async function POST(req: Request) {
  let to = ''
  try {
    const form = await req.formData()
    to = String(form.get('To') ?? '')
  } catch {
    // Malformed/empty body — fall through to the default Unique Group greeting.
  }

  const greeting = GREETINGS[to] ?? DEFAULT_GREETING

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect action="https://www.bario.ca/api/twilio/victoria-handoff">
    <ConversationRelay
      url="wss://miko-voice.bario.ca/"
      welcomeGreeting="${greeting}"
      ttsProvider="Amazon"
      voice="Emma-Neural"
    />
  </Connect>
</Response>`

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } })
}
