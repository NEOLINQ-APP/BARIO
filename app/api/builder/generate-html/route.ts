import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getOpenAI } from '@/lib/openai'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { hasBuilderAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'

// Full-HTML-document round trips through the model are genuinely slower
// than the sections endpoint's compact JSON, and no route in this app set
// a duration before — meaning this ran on Vercel's platform default, which
// a large template page can exceed. When that happens the function is
// killed with no response sent at all, and the client just hangs forever
// ("Zeus frozen") since there's nothing to catch. This is very likely what
// was actually happening — confirmed via Vercel logs showing this route
// returning responseStatusCode 0 (function killed mid-flight, no response).
export const maxDuration = 60

// Zeus editing for raw-HTML sites (a Premium Template, or a user's own
// uploaded HTML file) — a different job than app/api/builder/generate,
// which only ever produces Bario's fixed section schema. Here the model
// edits a real, already-designed HTML document directly and must hand the
// whole thing back, since there's no structured schema to patch fields on.
const SYSTEM_PROMPT = `You are Zeus, the AI website builder inside Bario. You're editing a complete, already-designed HTML page — its own custom CSS, layout, and possibly JavaScript — rather than one of Bario's own section templates. Preserve its existing visual style, structure, and design language; only change what the user actually asked for.

Always respond with a single JSON object of this shape:
{ "explanation": "one or two plain-language sentences describing what you changed and why", "html": "the FULL updated HTML document, starting with <!DOCTYPE html>" }

Rules:
- Return the complete HTML document every time, not a diff or a fragment — anything you leave out is deleted from the page.
- Copy everything not related to the request byte-for-byte: unrelated text, structure, styling, and scripts must come back exactly as given.
- Never invent or change an existing image's "src" attribute. The user can click any image directly on the canvas to replace it with a real upload — if they ask for a different image via chat, say so in your explanation and leave the src untouched.
- Never invent contact details (phone/email/address) the user hasn't given you.
- Keep existing <script> tags and interactive behavior (menus, forms, etc.) intact unless the user asked you to change that behavior specifically.`

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
    }

    if (!user.is_admin) {
      const creditsAvailable = await ensureCreditsRefreshed(sql, user)
      if (creditsAvailable <= 0) {
        const resetDate = user.credits_reset_at ? new Date(user.credits_reset_at).toLocaleDateString() : 'next billing cycle'
        return NextResponse.json(
          { error: `You're out of AI credits for this billing period. They refresh on ${resetDate}, or upgrade your plan for more.` },
          { status: 403 }
        )
      }
    }

    const { prompt, html } = await req.json()

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'A description is required' }, { status: 400 })
    }
    if (typeof html !== 'string' || !html.trim()) {
      return NextResponse.json({ error: 'No page content to edit' }, { status: 400 })
    }

    const userPrompt = `Edit this HTML page. The user wants: "${prompt}"\n\nCurrent HTML:\n${html}`

    // Full-document round trips add up fast — same guard as the sections
    // endpoint, so an oversized page fails fast with an actionable message
    // instead of burning a request on a doomed call.
    const roughTokenEstimate = (SYSTEM_PROMPT.length + userPrompt.length) / 4
    if (roughTokenEstimate > 100_000) {
      return NextResponse.json(
        {
          error:
            'This page is too large for the AI to edit in one go. Try asking for a smaller, more specific change, or edit the text directly on the canvas.',
        },
        { status: 400 }
      )
    }

    let completion
    try {
      completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      })
    } catch (err: any) {
      if (err?.code === 'context_length_exceeded') {
        return NextResponse.json(
          {
            error:
              'This page is too large for the AI to edit in one go. Try asking for a smaller, more specific change, or edit the text directly on the canvas.',
          },
          { status: 400 }
        )
      }
      throw err
    }

    const raw = completion.choices[0]?.message?.content
    if (!raw) throw new Error('No response from model')

    const parsed = JSON.parse(raw)
    if (typeof parsed.html !== 'string' || !/<html[\s>]/i.test(parsed.html)) {
      throw new Error("The AI's response didn't look like a valid page — nothing was changed. Try rephrasing your request.")
    }

    let creditsRemaining = -1
    if (!user.is_admin) {
      const creditRows = (await sql`
        UPDATE users SET credits_remaining = credits_remaining - 1 WHERE id = ${user.id}
        RETURNING credits_remaining
      `) as unknown as { credits_remaining: number }[]
      creditsRemaining = creditRows[0]?.credits_remaining ?? 0
    }

    return NextResponse.json({
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : 'Done.',
      html: parsed.html,
      creditsRemaining,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
