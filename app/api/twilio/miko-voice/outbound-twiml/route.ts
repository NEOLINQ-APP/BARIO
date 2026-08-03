import { NextResponse } from 'next/server'

// TwiML for a call Victoria places OUTBOUND (via lib/twilio.ts's
// placeMikoOutboundCall) — this route was referenced by that function but
// never actually existed until now, so outbound calling was non-functional.
// ctx is a base64url-encoded {jobContext} JSON blob (kept out of the query
// string as raw text so arbitrary free text doesn't need double XML
// escaping). jobContext is passed into the WebSocket session via a
// <Parameter> tag, which Twilio surfaces as customParameters on the
// ConversationRelay "setup" message — that's how the VPS-side server.js
// knows why this particular call was placed.
function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const ctxParam = url.searchParams.get('ctx') ?? ''

  let jobContext = 'This is a check-in call.'
  try {
    const decoded = JSON.parse(Buffer.from(ctxParam, 'base64url').toString('utf8'))
    if (typeof decoded?.jobContext === 'string' && decoded.jobContext.trim()) {
      jobContext = decoded.jobContext.trim()
    }
  } catch {
    // Malformed/missing ctx — fall through to the default check-in framing.
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect action="https://www.bario.ca/api/twilio/victoria-handoff">
    <ConversationRelay
      url="wss://miko-voice.bario.ca/"
      welcomeGreeting="Hi, this is Victoria calling for Mr. Mendoza."
      ttsProvider="Amazon"
      voice="Emma-Neural"
    >
      <Parameter name="jobContext" value="${escapeXmlAttr(jobContext)}" />
      <Parameter name="isOutbound" value="true" />
    </ConversationRelay>
  </Connect>
</Response>`

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } })
}
