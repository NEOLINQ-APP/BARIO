import { NextResponse } from 'next/server'

// Runs on the CALLEE's own leg the moment they answer a call Victoria
// placed on Mr. Mendoza's behalf (via the call_contact tool) — before that
// leg ever joins the parent <Dial> back on his side. Asks whether now's a
// good time rather than just bridging them in — respects that people are
// sometimes busy. The response goes to screen-call/handle, which decides
// whether this leg actually joins the call or hangs up.
export async function POST() {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" numDigits="1" speechTimeout="auto" action="https://www.bario.ca/api/twilio/screen-call/handle" method="POST">
    <Say voice="Polly.Emma-Neural">Hi, this is Victoria, Mr. Mendoza's assistant. He's on the line and would like to speak with you. Say yes, or press 1, if now's a good time — or say no, or press 2, if you're busy.</Say>
  </Gather>
  <Say voice="Polly.Emma-Neural">I didn't catch a response, so I'll let him know now isn't a good time.</Say>
  <Hangup/>
</Response>`

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } })
}
