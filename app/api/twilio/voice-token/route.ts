import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { requireAdmin } from '@/lib/admin'
import { findDialerBusiness } from '@/lib/dialerBusinesses'

// Short-lived Access Token for the Bario Dialer PWA's Twilio Voice SDK
// (client-side @twilio/voice-sdk). Scoped to one business's TwiML
// Application as its outgoing-call destination — the SDK can only place
// calls "as" the business this token was issued for, so a staff member
// picks the business first, gets a token for it, then dials.
export async function POST(req: Request) {
  const adminOrRes = await requireAdmin(req)
  if (adminOrRes instanceof NextResponse) return adminOrRes

  try {
    const body = await req.json().catch(() => ({}))
    const businessKey = typeof body?.businessKey === 'string' ? body.businessKey : null
    if (!businessKey) return NextResponse.json({ error: 'businessKey is required' }, { status: 400 })

    const business = findDialerBusiness(businessKey)
    if (!business) return NextResponse.json({ error: 'Unknown businessKey' }, { status: 400 })

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const apiKeySid = process.env.TWILIO_API_KEY_SID
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
    if (!accountSid || !apiKeySid || !apiKeySecret) return NextResponse.json({ error: 'Twilio is not configured' }, { status: 500 })

    // Voice Access Tokens must be signed with a real API Key SID/Secret
    // pair — signing with the Account SID itself in that slot (the
    // original approach here) produces a well-formed JWT that Twilio's
    // signaling servers still reject with AccessTokenInvalid (20101),
    // confirmed via a real browser test. There is no Account-SID-signed
    // fallback for this grant type.
    const AccessToken = twilio.jwt.AccessToken
    const VoiceGrant = AccessToken.VoiceGrant

    const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
      identity: `admin-${business.key}`,
      ttl: 3600,
    })
    token.addGrant(
      new VoiceGrant({
        outgoingApplicationSid: business.twimlAppSid,
        // Enables Internal (client-to-client) calls between the three
        // Bario Dialer apps — a registered Device can now receive an
        // <Client> dial, not just place outgoing calls.
        incomingAllow: true,
      })
    )

    return NextResponse.json({ token: token.toJwt(), identity: `admin-${business.key}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to generate token' }, { status: 500 })
  }
}
