import { NextResponse } from 'next/server'
import { findDialerBusiness } from '@/lib/dialerBusinesses'

function twiml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Strict E.164-ish check before ever interpolating a number into TwiML —
// this value can originate from a live transcription of spoken audio (the
// call_contact tool's raw phoneNumber path), not just a trusted lookup, so
// it's treated as untrusted input, not just validated for dial-ability.
function isSafePhoneNumber(value: string): boolean {
  return /^\+?[0-9]{7,15}$/.test(value)
}

// Called by Twilio once Victoria's ConversationRelay session ends (the
// `action` URL on <Connect>), carrying whatever HandoffData the WebSocket
// server set when it sent the "end" message. When Victoria decides to
// transfer a caller to a real business line, or connect Mr. Mendoza
// directly to a contact (call_contact), this is what actually dials it —
// ConversationRelay itself only handles the AI conversation, not real call
// transfers/connections.
export async function POST(req: Request) {
  const form = await req.formData()
  const raw = String(form.get('HandoffData') ?? '')

  let data: { action?: string; company?: string; phoneNumber?: string } = {}
  try {
    data = JSON.parse(raw)
  } catch {
    // No/invalid handoff data — Victoria ended the call normally (message
    // taken, question answered, etc.), nothing left to do but hang up.
  }

  if (data.action === 'transfer' && data.company) {
    const business = findDialerBusiness(data.company)
    if (business) {
      return twiml(`<Say voice="Polly.Emma-Neural">One moment while I connect you.</Say><Dial callerId="+18254650880">${business.forwardToNumber}</Dial>`)
    }
  }

  if (data.action === 'connect' && data.phoneNumber && isSafePhoneNumber(data.phoneNumber)) {
    // Screened connect, not a blind bridge — the callee gets asked first
    // (app/api/twilio/screen-call) and can decline, since they might be
    // busy. <Number url> runs that screening TwiML on the callee's own leg
    // before it ever joins this <Dial>; the action= here fires once the
    // Dial attempt is fully over, so a decline/no-answer can tell Mr.
    // Mendoza what happened instead of him just hearing dead air.
    return twiml(
      `<Say voice="Polly.Emma-Neural">One moment, let me check if they're available.</Say>` +
      `<Dial callerId="+18254650880" action="https://www.bario.ca/api/twilio/screen-call/result">` +
      `<Number url="https://www.bario.ca/api/twilio/screen-call">${data.phoneNumber}</Number>` +
      `</Dial>`
    )
  }

  return twiml('<Hangup/>')
}
