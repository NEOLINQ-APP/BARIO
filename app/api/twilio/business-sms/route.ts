import { NextResponse } from 'next/server'
import { sendSms } from '@/lib/twilio'
import { DIALER_BUSINESSES } from '@/lib/dialerBusinesses'

function emptyTwiml() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Plain SMS forwarder for AFC/Sunbuilt/Unique's business Twilio numbers.
// Unlike app/api/twilio/miko-sms (Victoria's personal/family AI assistant
// line, which deliberately refuses to relay verification codes for safety),
// this route does zero AI processing — it just relays the raw incoming text
// verbatim to that business's real forward-to number (same mapping the
// Dialer uses), so dispatch actually sees texts and verification codes sent
// to their Twilio number instead of them silently vanishing. None of these
// numbers had an SmsUrl configured before this route existed — Twilio
// accepted the SMS but had nowhere to send it.
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const to = String(form.get('To') ?? '')
    const from = String(form.get('From') ?? '')
    const body = String(form.get('Body') ?? '').trim()

    const business = DIALER_BUSINESSES.find((b) => b.twilioNumber === to)
    if (business && body) {
      await sendSms(business.forwardToNumber, `[${business.businessName} text from ${from}]: ${body}`, to)
    } else {
      console.error('business-sms: no matching business for To=', to)
    }
  } catch (err) {
    console.error('business-sms forward failed', err)
  }
  // No reply to the original sender — many senders here are automated
  // systems (e.g. a verification-code sender) that don't expect one, and a
  // stray auto-reply would look odd to a real person texting the business.
  return emptyTwiml()
}
