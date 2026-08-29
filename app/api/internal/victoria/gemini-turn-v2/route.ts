import { NextResponse } from 'next/server'

// Gemini pilot for Victoria's voice line (2026-08-21, Unique Group Inc.'s
// line only — see server.js's runTurnGemini). Proxies a generateContent
// call through Vercel rather than putting GEMINI_API_KEY on the VPS too —
// it's a Sensitive Vercel env var (write-only, can't be read back to copy
// onto a second server), and this avoids duplicating the secret across
// infra anyway. Same Bearer auth as the other internal/victoria routes —
// server-to-server only, not customer-facing.
const GEMINI_MODEL = 'gemini-3-flash-preview'

// NOTE (2026-08-21): explicitly declaring `export const maxDuration` on
// this specific route reproducibly broke it (every request 502'd, even a
// bare no-tools one) across two separate clean deploys, despite the exact
// same pattern working fine elsewhere in this codebase (studio/export,
// social/dispatch, etc.). Left undeclared (falls back to the project
// default) rather than chasing why further. If a real Google Search call
// genuinely needs more time than the default allows, server.js's own
// caller times out client-side and fails open (search skipped) rather
// than depending on this route surviving a longer server-side duration.

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const adminKey = process.env.BARIO_ADMIN_API_KEY
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error?.message ?? `Gemini ${res.status}` }, { status: 502 })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
