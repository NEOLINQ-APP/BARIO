import { NextResponse } from 'next/server'
import { findDialerBusiness } from '@/lib/dialerBusinesses'

// Voice URL for all three businesses' TwiML Applications (lib/dialerBusinesses.ts)
// — Twilio calls this whenever the Bario Dialer PWA's Voice SDK places an
// outbound call. The SDK passes its own custom params (business, To) via
// device.connect({ params }), which Twilio forwards here as POST fields.
// One shared endpoint rather than one per business: which caller ID to use
// is looked up from the `business` param, not hardcoded per Application.
function twiml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(req: Request) {
  const form = await req.formData()
  const to = String(form.get('To') ?? '')
  const businessKey = String(form.get('business') ?? '')

  const business = findDialerBusiness(businessKey)
  if (!business) {
    return twiml('<Say>Sorry, this call could not be placed. Please try again.</Say>')
  }

  // Internal calling — rings another Bario Dialer app's registered Device
  // directly over Twilio's signaling (client-to-client), no real phone
  // number or carrier minutes involved on either leg.
  if (to.startsWith('internal:')) {
    const targetKey = to.slice('internal:'.length)
    const target = findDialerBusiness(targetKey)
    if (!target) return twiml('<Say>Sorry, that app is not available.</Say>')
    return twiml(`<Dial><Client>admin-${target.key}</Client></Dial>`)
  }

  if (!/^\+?[1-9]\d{7,14}$/.test(to)) {
    return twiml('<Say>Sorry, this call could not be placed. Please try again.</Say>')
  }

  return twiml(`<Dial callerId="${business.twilioNumber}"><Number>${to}</Number></Dial>`)
}
