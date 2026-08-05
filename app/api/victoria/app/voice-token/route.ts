import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'

// Short-lived Access Token for the Victoria assistant app's Twilio Voice SDK
// call button — same mechanism as app/api/twilio/voice-token/route.ts (the
// Bario Dialer's own token route), but scoped to the dedicated "VICTORIA
// APP" TwiML Application (connects straight into ConversationRelay, not a
// PSTN redial — see app/api/twilio/victoria-app-call/route.ts) and gated to
// Sherwin's own session, matching the chat route's own auth boundary.
const OWNER_EMAIL = 'uniquegroup.org@gmail.com'
const VICTORIA_APP_TWIML_APP_SID = 'AP75745c017a6693b28d50f93009002fd1'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user || user.email.toLowerCase() !== OWNER_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const apiKeySid = process.env.TWILIO_API_KEY_SID
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
    if (!accountSid || !apiKeySid || !apiKeySecret) return NextResponse.json({ error: 'Twilio is not configured' }, { status: 500 })

    const AccessToken = twilio.jwt.AccessToken
    const VoiceGrant = AccessToken.VoiceGrant

    const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
      identity: 'victoria-app',
      ttl: 3600,
    })
    token.addGrant(
      new VoiceGrant({
        outgoingApplicationSid: VICTORIA_APP_TWIML_APP_SID,
        incomingAllow: false,
      })
    )

    return NextResponse.json({ token: token.toJwt() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to generate token' }, { status: 500 })
  }
}
