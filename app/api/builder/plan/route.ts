import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasZeusStudioAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/builderPrompt'

// Plan Mode's "show me what you'd do before you do it" step. Deliberately
// separate from /api/builder/generate: this is a fast, cheap, non-streaming
// call (no credit deducted — planning is free, only the real build costs
// one) that describes intended changes in plain language without writing
// any real content, section data, or images.
const PLAN_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

---

You are NOT building the site right now. A user is deciding whether to approve what you're about to do before you actually do it. Given their request and the context above, write a SHORT plan (3-6 bullet points, plain text, one per line, starting each with "- ") describing specifically what you would build or change — which pages, which sections, what the theme/colors would be, what kind of images you'd search for. Be concrete (name real section types and page names), not vague ("I'll improve the design"). Do not write any actual headlines, copy, or JSON — this is a summary of intent, not the content itself. No preamble, no closing remarks, just the bullet list.`

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasZeusStudioAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
    }

    const { prompt, pages, activeSlug, theme, isNew, businessName, businessCategory, businessHours, businessLocation } = await req.json()
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'A description is required' }, { status: 400 })
    }

    const { userPrompt } = buildUserPrompt({
      prompt, pages, activeSlug, theme, isNew, businessName, businessCategory, businessHours, businessLocation,
    })

    const { text } = await generateText({
      model: openai('gpt-5.6-luna'),
      system: PLAN_SYSTEM_PROMPT,
      prompt: userPrompt,
      // Same reasoning as the other 'none'-effort calls in this codebase
      // (studio/copilot, drivers-exam-assist): this is a short, fast,
      // low-stakes summary, not the compositional work the real build does.
      providerOptions: { openai: { reasoningEffort: 'none' } },
    })

    return NextResponse.json({ plan: text.trim() || "I'd build this based on your request — approve to go ahead." })
  } catch (err: any) {
    return errorResponse(err)
  }
}
