import { NextResponse } from 'next/server'
import { getOpenAI } from '@/lib/openai'

// OpenAI pilot for Victoria's voice line (2026-08-21, Unique Group Inc.'s
// line only — see server.js's runTurnOpenAI). Same server-to-server Bearer
// pattern as internal/victoria/gemini-turn, but uses the existing getOpenAI()
// client (already proven live elsewhere — studio/copilot, requestEstimator,
// crm-outreach) rather than a raw fetch, since the SDK already handles auth
// correctly. New path (not reusing gemini-turn's) deliberately — that path
// hit an unresolved Cloudflare L7 mitigation block tied to its own traffic
// history, and a fresh path sidesteps that rather than risk inheriting it.
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const adminKey = process.env.BARIO_ADMIN_API_KEY
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const completion = await getOpenAI().chat.completions.create(body)
    return NextResponse.json(completion)
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
