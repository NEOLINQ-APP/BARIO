import { NextResponse } from 'next/server'

// TwiML for calls placed from Sherwin's own Victoria Assistant app
// (bario.ca/victoria-app, via the Bario Dialer's existing Twilio Voice SDK
// setup — see components/BarioDialer.tsx's device.connect() pattern, reused
// here rather than building a separate browser-calling mechanism). Unlike
// a normal Dialer call, this connects the browser leg DIRECTLY into
// ConversationRelay — no PSTN redial to Victoria's real phone number needed,
// since Twilio can bridge a WebRTC leg straight into the same
// Connect/ConversationRelay verb used elsewhere. Reuses the exact same VPS
// WebSocket backend (wss://miko-voice.bario.ca) as the real phone line and
// outbound calls — same tools, same memory, same everything, just a
// different name/voice "skin" selected by the `persona` param the browser
// sends via device.connect({ params: { persona } }).
//
// action points at the same victoria-handoff route the main receptionist
// line uses — needed so call_contact (e.g. "call my brother and get him on
// the phone") still works correctly when triggered from an app call.
const PERSONA_VOICES: Record<string, { name: string; voice: string }> = {
  victoria: { name: 'Victoria', voice: 'EXAVITQu4vr4xnSDxMaL' }, // was UgBBYS2sOqTuMpoF3BR0, which a real call proved was male despite being claimed "confirmed" — now shares Lindsay's independently-confirmed-female ID
  charlotte: { name: 'Charlotte', voice: 'Xb7hH8MSUJpSbSDYk0k2' }, // real test call completed cleanly; British accent
  layla: { name: 'Layla', voice: 'AZnzlk1XvdvUeBnXmlld' }, // NOT individually voice-tested yet — confirm once tried live
  lindsay: { name: 'Lindsay', voice: 'EXAVITQu4vr4xnSDxMaL' }, // confirmed via a real test call
  jade: { name: 'Jade', voice: 'MF3mGyEYCl7XYWbV9V6O' }, // NOT individually voice-tested yet — confirm once tried live
  miko: { name: 'Miko', voice: '21m00Tcm4TlvDq8ikWAM' }, // ElevenLabs' "Rachel" — CRM/customer specialist. Shares a voice with Amber for now (both new, no second verified-female ID available yet); swap one once a candidate is confirmed via a real test call
  amber: { name: 'Amber', voice: '21m00Tcm4TlvDq8ikWAM' }, // "Rachel" — invoices/billing/admin-finance specialist. See miko's note above re: shared voice
}
const DEFAULT_PERSONA = 'victoria'

export async function POST(req: Request) {
  let personaKey = DEFAULT_PERSONA
  let member = ''
  try {
    const form = await req.formData()
    const requested = String(form.get('persona') ?? '')
    if (requested && PERSONA_VOICES[requested]) personaKey = requested
    // Set only for a family member's own /victoria-family/[member] link
    // (see app/api/victoria/family/voice-token/route.ts) -- tells the VPS
    // ConversationRelay backend to use the restricted family prompt/tools
    // instead of Sherwin's full personal-assistant set. Absent entirely for
    // Sherwin's own app, so his call flow is completely unchanged.
    const requestedMember = String(form.get('member') ?? '')
    if (/^[a-z]+$/.test(requestedMember)) member = requestedMember
  } catch {
    // Malformed/empty body — fall through to the default persona.
  }

  const persona = PERSONA_VOICES[personaKey]

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect action="https://www.bario.ca/api/twilio/victoria-handoff">
    <ConversationRelay
      url="wss://miko-voice.bario.ca/"
      welcomeGreeting="Hi, it's ${persona.name}!"
      ttsProvider="ElevenLabs"
      voice="${persona.voice}"
    >
      <Parameter name="persona" value="${personaKey}" />
      ${member ? `<Parameter name="member" value="${member}" />` : ''}
    </ConversationRelay>
  </Connect>
</Response>`

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } })
}
