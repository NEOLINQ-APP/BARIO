import { NextResponse } from 'next/server'
import { db, type VoiceAgentConfig } from '@/lib/db'

// Called by miko-voice/server.js on the VPS (a separate Node process with
// no direct DB access) at call setup, when the dialed number isn't one of
// its own hardcoded businesses. Bearer-gated with its own secret rather
// than BARIO_ADMIN_API_KEY — this endpoint only ever returns one
// customer's own already-public-facing config (their business name/
// greeting), so it doesn't need full admin scope, just "is this really the
// VPS calling."
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.VOICE_AGENT_INTERNAL_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const to = new URL(req.url).searchParams.get('to')
  if (!to) return NextResponse.json({ error: 'to is required' }, { status: 400 })

  const sql = await db()
  const rows = (await sql`SELECT * FROM voice_agent_configs WHERE twilio_number = ${to}`) as unknown as VoiceAgentConfig[]
  const config = rows[0]
  if (!config) return NextResponse.json({ error: 'No config for this number' }, { status: 404 })

  // Only a boolean + the config id go back — never the Flo API key itself.
  // The raw key was never stored anywhere (lib/flo/apiKeys.ts hashes it at
  // creation and shows it once), so there's nothing to hand back even if
  // we wanted to. A captured lead is submitted through the separate
  // /api/internal/voice-agent-lead route instead, which resolves the CRM
  // write server-side from configId — see that route for why.
  return NextResponse.json({
    businessName: config.business_name,
    businessDescription: config.business_description,
    forwardToNumber: config.forward_to_number,
    greeting: config.greeting,
    hasCrmLink: !!config.flo_api_key_id,
    configId: config.id,
  })
}
