import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rateLimit'
import { getOpenAI } from '@/lib/openai'
import { errorResponse } from '@/lib/errors'

// Public AI tutor for driverscanada.bario.ca's practice exam (2026-08-22).
// The page used to ask visitors to paste their OWN Gemini API key into a
// browser field — real driving-test learners don't have one, so the
// feature was effectively non-functional (silently fell back to one
// hardcoded canned answer regardless of the question). This gives it a
// real, working backend using BARIO's own keys instead, same pattern as
// every other AI feature in this project — no key required from visitors.
// No login exists on this public site, so instead of session/Bearer auth
// this is rate-limited per IP (DB-backed, holds across serverless
// instances) and kept on a narrow, fixed system prompt so it can't be used
// as a general-purpose free LLM proxy.
const SYSTEM_PROMPT = `You are a helpful, concise driving-knowledge-test tutor for Canadian learner drivers (car, boating, and related road-rules questions). Answer only questions about Canadian driving/road rules, traffic signs, licensing (e.g. GDL/Class 7), or boating safety regulations — for anything else, say briefly that you can only help with driving/road-rules questions. Keep answers short (2-4 sentences), clear, and accurate. If you're not certain of a specific province's exact rule, say so rather than guessing — general Canadian road-rule knowledge is fine, but don't invent province-specific numbers/limits you're not sure of.`

const GEMINI_MODEL = 'gemini-3-flash-preview'

async function askGemini(query: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: query }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { maxOutputTokens: 300, thinkingConfig: { thinkingLevel: 'low' } },
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message ?? `Gemini ${res.status}`)
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text || '').join('').trim()
  if (!text) throw new Error('Gemini returned an empty response')
  return text
}

async function askLuna(query: string): Promise<string> {
  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-5.6-luna',
    max_completion_tokens: 300,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query },
    ],
    reasoning_effort: 'none',
  })
  const text = completion.choices[0]?.message?.content?.trim()
  if (!text) throw new Error('Luna returned an empty response')
  return text
}

export async function POST(req: Request) {
  try {
    const { query, provider } = (await req.json()) as { query?: string; provider?: string }
    if (typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'A question is required' }, { status: 400 })
    }
    if (query.length > 500) {
      return NextResponse.json({ error: 'Question is too long' }, { status: 400 })
    }

    const sql = await db()
    const ip = clientIp(req)
    const allowed = await rateLimit(sql, `drivers-exam-assist:${ip}`, 15, 3600)
    if (!allowed) return rateLimitResponse()

    const useLuna = provider === 'luna'
    const answer = useLuna ? await askLuna(query.trim()) : await askGemini(query.trim())
    return NextResponse.json({ answer, provider: useLuna ? 'luna' : 'gemini' })
  } catch (err: any) {
    return errorResponse(err)
  }
}
