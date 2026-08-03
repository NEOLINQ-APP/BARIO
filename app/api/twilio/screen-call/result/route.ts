import { NextResponse } from 'next/server'

function twiml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Fires on Mr. Mendoza's own leg once the screened <Dial> to the callee is
// fully over — whether they actually talked, or the callee declined via
// screen-call/handle and never joined. DialCallStatus is Twilio's own
// signal for which happened; only 'completed' means the two of them
// actually got connected.
export async function POST(req: Request) {
  const form = await req.formData()
  const status = String(form.get('DialCallStatus') ?? '')

  if (status === 'completed') {
    return twiml('<Hangup/>')
  }

  return twiml(`<Say voice="Polly.Emma-Neural">They weren't able to take the call right now — I'll let you know if I hear back.</Say><Hangup/>`)
}
