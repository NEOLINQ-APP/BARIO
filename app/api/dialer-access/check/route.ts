import { NextResponse } from 'next/server'
import { findDialerBusiness } from '@/lib/dialerBusinesses'

// Passcode check for the self-serve client Dialer (app/dialer/<key>) — same
// "good enough to hand to a trusted client, not a real security boundary"
// tier as afclogistics.ca's own footer passcode gate. The real access
// control that matters (which Twilio number/CRM a call can use) still lives
// entirely server-side in voice-token/route.ts and browser-call/route.ts;
// this route only decides whether the passcode form on the client can
// proceed to render the Dialer UI at all.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const businessKey = typeof body?.businessKey === 'string' ? body.businessKey : ''
  const passcode = typeof body?.passcode === 'string' ? body.passcode : ''

  const business = findDialerBusiness(businessKey)
  const envVar = business?.clientPasscodeEnvVar
  const expected = envVar ? process.env[envVar] : undefined

  if (!expected || !passcode || passcode !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}
