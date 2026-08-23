import { NextResponse } from 'next/server'
import { findDialerBusiness } from '@/lib/dialerBusinesses'

// Voice URL for a Dialer business's own Twilio number (as opposed to
// browser-call, which is the TwiML Application's voice_url used only when
// the Dialer PWA itself places an outbound call). This handles someone on
// the PSTN calling that number directly -- rings whichever Dialer app has
// registered as admin-<key> (same Client identity voice-token issues), and
// says a short message if nothing picks up. No forwardToNumber fallback
// here by design: a business without one (see lib/dialerBusinesses.ts)
// wants the Dialer app to be the only phone, not silently relayed
// elsewhere. `business` comes from this route's own configured query
// string on the phone number resource (e.g. ?business=jade), not from the
// POST body -- Twilio still includes a webhook URL's query params on the
// request even though the body itself is form-encoded.
function twiml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const businessKey = url.searchParams.get('business') ?? ''
  const business = findDialerBusiness(businessKey)

  if (!business) {
    return twiml('<Say>Sorry, this number is not set up correctly. Please try again later.</Say>')
  }

  // Real bug fix (2026-08-23): without an explicit callerId, the Client leg
  // of this Dial was showing this business's own Twilio number instead of
  // the real external caller's number in the Dialer app. {{From}} is
  // Twilio's own TwiML templating syntax -- it's substituted server-side
  // with this inbound request's real From value before Twilio parses the
  // Dial verb, guaranteeing the original caller's number is what the
  // Client SDK actually receives as call.parameters.From.
  return twiml(
    `<Dial timeout="25" callerId="{{From}}"><Client>admin-${business.key}</Client></Dial><Say>${business.businessName} isn't available right now. Please try again later.</Say>`
  )
}
