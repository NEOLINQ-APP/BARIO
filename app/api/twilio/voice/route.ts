import { NextResponse } from 'next/server'

// Real call forwarding for the per-business Twilio numbers already
// purchased on the Unique Group Twilio (sub)account — a client calling
// e.g. AFC Logistics's number rings straight through to a real person's
// phone. One shared TwiML endpoint rather than one per business: each
// number's own Voice Configuration passes its forward-to number as a
// query param (?to=+1XXXXXXXXXX), so adding a new business later is just
// pointing its number at this same URL with its own ?to= value — no new
// code needed.
function twiml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const to = url.searchParams.get('to')
  if (!to || !/^\+?[1-9]\d{7,14}$/.test(to)) {
    return twiml('<Say>Sorry, this number is not configured correctly. Please contact support.</Say>')
  }
  return twiml(`<Dial>${to}</Dial>`)
}

// Twilio's webhook validator can be configured to call via GET too,
// depending on the number's console setting — handle both the same way.
export async function GET(req: Request) {
  return POST(req)
}
