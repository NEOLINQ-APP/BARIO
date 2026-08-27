import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// One-off diagnostic: real-time voice_url/sms_url/status for specific
// numbers, straight from Twilio's API — used to verify the AFC/Sunbuilt
// Bario Voice shutoff (voice_url/sms_url cleared 2026-08-19/20, see
// [[bario_afc_sunbuilt_lockout_and_disconnection]]) is still actually in
// effect, not accidentally restored by an unrelated later change.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const numbers = new URL(req.url).searchParams.get('numbers')?.split(',') ?? []
    if (!numbers.length) return NextResponse.json({ error: 'Pass ?numbers=+1..,+1..' }, { status: 400 })

    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    if (!sid || !token) return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
    const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')

    const results: Record<string, any> = {}
    for (const number of numbers) {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`,
        { headers: { Authorization: authHeader } }
      )
      const data = await res.json()
      const record = data.incoming_phone_numbers?.[0]
      results[number] = record
        ? { sid: record.sid, friendlyName: record.friendly_name, status: record.status, voiceUrl: record.voice_url, smsUrl: record.sms_url }
        : { error: 'Not found' }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return errorResponse(err)
  }
}
