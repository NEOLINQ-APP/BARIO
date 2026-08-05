import { NextResponse } from 'next/server'
import { findDialerBusiness } from '@/lib/dialerBusinesses'
import { VICTORIA_GREETINGS, buildVictoriaConnectTwiml } from '@/lib/victoriaTwiml'
import { db, type VoiceAgentConfig } from '@/lib/db'

// Twilio calls this once the <Dial> to the owner's real cell
// (app/api/twilio/miko-voice/route.ts) resolves, whether answered or not —
// DialCallStatus says which. If the owner actually answered ('completed'),
// there's nothing left to do; the call already happened and Twilio hangs up
// naturally on an empty response. Anything else (no-answer, busy, failed,
// canceled) means the real person never picked up, so Victoria takes over
// as a genuine missed-call fallback instead of the caller hitting dead air
// or a generic carrier voicemail.
export async function POST(req: Request) {
  const url = new URL(req.url)
  const businessKey = url.searchParams.get('business') ?? ''
  const configId = url.searchParams.get('configId') ?? ''

  let dialStatus = ''
  try {
    const form = await req.formData()
    dialStatus = String(form.get('DialCallStatus') ?? '')
  } catch {
    // Malformed/empty body — fall through, treated as not-completed below.
  }

  if (dialStatus === 'completed') {
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
  }

  // AFC/Sunbuilt/Unique — unchanged path.
  const business = findDialerBusiness(businessKey)
  if (business) {
    return new NextResponse(buildVictoriaConnectTwiml(VICTORIA_GREETINGS[business.key] ?? VICTORIA_GREETINGS.unique), { headers: { 'Content-Type': 'text/xml' } })
  }

  // Voice Agent reseller customer — greeting built from their own submitted
  // business name/greeting rather than the hardcoded VICTORIA_GREETINGS map.
  if (configId) {
    const sql = await db()
    const rows = (await sql`SELECT * FROM voice_agent_configs WHERE id = ${configId}`) as unknown as VoiceAgentConfig[]
    const config = rows[0]
    if (config) {
      return new NextResponse(buildVictoriaConnectTwiml(config.greeting), { headers: { 'Content-Type': 'text/xml' } })
    }
  }

  return new NextResponse(buildVictoriaConnectTwiml(VICTORIA_GREETINGS.unique), { headers: { 'Content-Type': 'text/xml' } })
}
