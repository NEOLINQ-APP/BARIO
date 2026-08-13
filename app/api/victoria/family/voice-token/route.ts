import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { db } from '@/lib/db'
import { verifyFamilyToken } from '@/lib/victoriaFamilyAccess'

// Same TwiML App as Sherwin's own Victoria app voice-token route -- token
// gated instead of session-gated. The `member` custom param carried into
// the call (see app/api/twilio/victoria-app-call/route.ts) is what tells
// the VPS ConversationRelay backend to use the restricted family
// prompt/tools instead of Sherwin's full personal-assistant set.
const VICTORIA_APP_TWIML_APP_SID = 'AP75745c017a6693b28d50f93009002fd1'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const memberKey = typeof body?.member === 'string' ? body.member : null
  const token = typeof body?.token === 'string' ? body.token : null

  const sql = await db()
  const member = await verifyFamilyToken(sql, memberKey, token)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const apiKeySid = process.env.TWILIO_API_KEY_SID
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
    if (!accountSid || !apiKeySid || !apiKeySecret) return NextResponse.json({ error: 'Twilio is not configured' }, { status: 500 })

    const AccessToken = twilio.jwt.AccessToken
    const VoiceGrant = AccessToken.VoiceGrant

    const token2 = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
      identity: `victoria-family-${member.key}`,
      ttl: 3600,
    })
    token2.addGrant(
      new VoiceGrant({
        outgoingApplicationSid: VICTORIA_APP_TWIML_APP_SID,
        incomingAllow: false,
      })
    )

    return NextResponse.json({ token: token2.toJwt() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to generate token' }, { status: 500 })
  }
}
