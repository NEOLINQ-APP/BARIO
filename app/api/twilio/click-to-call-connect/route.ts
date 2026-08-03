import { NextResponse } from 'next/server'

// Second leg of click-to-call (lib/twilio.ts's placeClickToCall): Twilio
// calls this once the staff member's phone actually picks up, and this
// TwiML tells it what to do next — dial the lead's number, bridging the
// two live. Separate from app/api/twilio/voice (plain inbound forwarding)
// since the two have different triggers and different "to" semantics.
function twiml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const to = url.searchParams.get('to')
  if (!to || !/^\+?[1-9]\d{7,14}$/.test(to)) {
    return twiml('<Say>Sorry, this call could not be connected. Please contact support.</Say>')
  }
  return twiml(`<Say>Connecting your call now.</Say><Dial>${to}</Dial>`)
}

export async function GET(req: Request) {
  return POST(req)
}
