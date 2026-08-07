import { NextResponse } from 'next/server'
import { findDialerBusiness } from '@/lib/dialerBusinesses'

// Whisper TwiML — played only to the business owner's real cell after they
// answer a forwarded call, before the caller is bridged in (referenced via
// the <Number url="..."> attribute in miko-voice/route.ts, not the <Dial>
// itself, so it never touches the existing ring-timeout/fallback-to-Victoria
// behavior). Answers the two things Sherwin can't currently tell from a
// silent forward: which business line this is, and who's calling.
function formatNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^1/, '')
  if (digits.length !== 10) return raw
  return `1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const businessKey = url.searchParams.get('business') ?? ''
  const from = url.searchParams.get('from') ?? ''

  const business = findDialerBusiness(businessKey)
  const businessName = business?.businessName ?? 'your business line'
  const callerText = from ? `Incoming call from ${formatNumber(from)}.` : 'Incoming call.'

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew-Neural">Call for ${businessName}. ${callerText}</Say>
</Response>`

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } })
}
