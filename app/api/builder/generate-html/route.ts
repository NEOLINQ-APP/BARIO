import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getOpenAI } from '@/lib/openai'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { hasBuilderAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'

export const maxDuration = 60

// Zeus editing for raw-HTML sites (a Premium Template, or a user's own
// uploaded HTML file) — a different job than app/api/builder/generate,
// which only ever produces Bario's fixed section schema.
//
// This used to ask the model to return the FULL edited document on every
// request. For a small change ("change the site name") that meant
// regenerating an entire multi-KB page — thousands of output tokens for a
// two-word edit, which for larger templates (lots of inline JS/data, e.g.
// a dealership inventory script) was slow enough to exceed the function's
// execution time and get killed with no response at all (confirmed via
// Vercel logs: responseStatusCode 0, i.e. "Zeus frozen", not a timeout that
// just needed a longer budget). The actual fix is generating less: the
// model now returns small find/replace edits applied server-side, so
// output size — and therefore latency — no longer scales with page size.
const SYSTEM_PROMPT = `You are Zeus, the AI website builder inside Bario. You're editing a complete, already-designed HTML page — its own custom CSS, layout, and possibly JavaScript — rather than one of Bario's own section templates. Preserve its existing visual style, structure, and design language; only change what the user actually asked for.

Always respond with a single JSON object of this shape:
{ "explanation": "one or two plain-language sentences describing what you changed and why", "edits": [ { "find": "exact text to find", "replace": "text to replace it with" } ] }

Rules for edits:
- "find" must be copied VERBATIM from the raw HTML text given below — exact characters, exact whitespace, no paraphrasing. Copy it from the actual source, not from how the text would visually render.
- Text that looks like one continuous phrase on the page is often split across nested tags in the source (e.g. a logo reading "APEX MOTORS" might actually be written as APEX<span class="...">MOTORS</span> with no literal "APEX MOTORS" substring anywhere). If the visible phrase you want to change isn't one unbroken string in the source, find and edit each piece separately instead of trying to match the whole phrase at once.
- "find" must be unique: include enough surrounding context (a few extra words, a nearby attribute, whatever it takes) that it matches exactly one place in the document. A "find" that matches zero times or more than once will be rejected and that change won't apply — so when in doubt, double-check the exact text against the source before writing it.
- Keep each edit small and targeted — one "find"/"replace" pair per distinct change, not one giant block covering the whole page.
- Never invent or change an existing image's "src" attribute. The user can click any image directly on the canvas to replace it with a real upload — if they ask for a different image via chat, say so in your explanation and leave the src untouched.
- Never invent contact details (phone/email/address) the user hasn't given you.
- Don't touch <script> tags or interactive behavior unless the user specifically asked to change that behavior.
- If the request doesn't require changing the HTML at all (e.g. a question), return an empty "edits" array and explain in "explanation".`

type Edit = { find: string; replace: string }

function applyEdits(html: string, edits: Edit[]): { result: string; failed: string[] } {
  let result = html
  const failed: string[] = []
  for (const edit of edits) {
    if (typeof edit.find !== 'string' || typeof edit.replace !== 'string' || !edit.find) continue
    const occurrences = result.split(edit.find).length - 1
    if (occurrences !== 1) {
      failed.push(edit.find.slice(0, 60))
      continue
    }
    result = result.replace(edit.find, edit.replace)
  }
  return { result, failed }
}

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

    // The model still has to read the whole page to find the right spot —
    // this guard is about input size, not output size (output is now small
    // regardless of page size).
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
    const edits: Edit[] = Array.isArray(parsed.edits) ? parsed.edits : []

    const { result, failed } = applyEdits(html, edits)
    if (!/<html[\s>]/i.test(result)) {
      throw new Error("Something went wrong applying that change — nothing was modified. Try rephrasing your request.")
    }

    // The model can (and did, in testing) describe a change in prose while
    // the actual find/replace silently failed to match — never let a
    // no-op masquerade as success. If nothing in the document actually
    // changed, the message reflects that plainly instead of the model's
    // possibly-false claim.
    const nothingChanged = result === html
    let explanation: string
    if (nothingChanged && edits.length > 0) {
      explanation = `I couldn't find the exact text to change — "${failed[0]?.slice(0, 60) ?? edits[0].find.slice(0, 60)}${(failed[0]?.length ?? edits[0].find.length) >= 60 ? '…' : ''}" doesn't appear in the page as I expected. Try describing it differently, or click directly on the text on the canvas to edit it.`
    } else if (nothingChanged) {
      explanation = typeof parsed.explanation === 'string' ? parsed.explanation : "I didn't make any changes — could you describe what you'd like differently?"
    } else {
      explanation = typeof parsed.explanation === 'string' ? parsed.explanation : 'Done.'
      if (failed.length > 0) {
        explanation += ` (One part of this didn't apply — couldn't find an exact match for "${failed[0].slice(0, 60)}${failed[0].length >= 60 ? '…' : ''}".)`
      }
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
      explanation,
      html: result,
      creditsRemaining,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
