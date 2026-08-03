import { NextResponse } from 'next/server'

function twiml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Decides, from what the callee just said/pressed, whether to actually
// join them into the call with Mr. Mendoza (returning empty/normal TwiML
// lets this leg fall through and merge into the parent <Dial>) or decline
// on their behalf (an explicit <Say> + <Hangup> — this leg never joins,
// so he hears "not available" via the <Dial action> callback instead of
// silence).
export async function POST(req: Request) {
  const form = await req.formData()
  const digits = String(form.get('Digits') ?? '')
  const speech = String(form.get('SpeechResult') ?? '').toLowerCase()

  const accepted = digits === '1' || /\b(yes|yeah|yep|sure|okay|ok)\b/.test(speech)
  const declined = digits === '2' || /\b(no|nope|not now|can't|busy)\b/.test(speech)

  if (declined || !accepted) {
    return twiml(`<Say voice="Polly.Emma-Neural">No problem, I'll let him know. Thanks!</Say><Hangup/>`)
  }

  // Accepted — say nothing more here; falling through with no further
  // verbs lets this leg join the parent <Dial> now.
  return twiml('')
}
