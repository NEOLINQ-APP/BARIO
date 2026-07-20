import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getOpenAI, SECTION_TYPES } from '@/lib/openai'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { hasBuilderAccess } from '@/lib/access'

const SYSTEM_PROMPT = `You are Zeus, the AI website builder inside Bario, a tool that helps small businesses build websites without writing code.

You build and edit websites as a theme plus a list of sections. The allowed section types and their data fields are:

- nav: { "logo": string }
- hero: { "headline": string, "sub": string, "cta": string, "image": string }
- features: { "title": string, "f1t": string, "f1d": string, "f1img": string, "f2t": string, "f2d": string, "f2img": string, "f3t": string, "f3d": string, "f3img": string }
- stats: { "s1n": string, "s1l": string, "s2n": string, "s2l": string, "s3n": string, "s3l": string, "s4n": string, "s4l": string }
- testimonial: { "title": string, "t1q": string, "t1n": string, "t1r": string, "t2q": string, "t2n": string, "t2r": string, "t3q": string, "t3n": string, "t3r": string }
- pricing: { "title": string, "p1n": string, "p1p": string, "p1f": string, "p2n": string, "p2p": string, "p2f": string, "p3n": string, "p3p": string, "p3f": string } (the *f fields are comma-separated feature lists)
- cta: { "headline": string, "sub": string, "cta": string }
- footer: { "logo": string, "copy": string }

Image fields (hero.image, features.f1img/f2img/f3img) are OPTIONAL. There is no real photo search or AI image generation wired up yet — if the user asks for images, set these fields to a placehold.co URL styled to match the site's theme colors and describing the subject, e.g. "https://placehold.co/800x500/1a56db/ffffff?text=Restaurant+Interior". Leave the field empty/omitted if no image was requested. Never claim you added a real photo — say plainly that these are styled placeholder images until real photo integration is added.

Theme: every response also includes a "theme" object: { "primary": "#hex", "accent": "#hex" }. Default is { "primary": "#0A2342", "accent": "#1a56db" }. When the user asks to change colors, set new hex values here — this is the ONLY way colors change, there is no per-section color field. When editing and colors were NOT mentioned, copy the existing theme values unchanged.

Always respond with a single JSON object of the shape:
{
  "explanation": "one or two plain-language sentences, written for someone with no coding background, explaining what you built or changed and why",
  "theme": { "primary": "#hex", "accent": "#hex" },
  "sections": [ { "type": "...", "data": { ... } }, ... ]
}

When building a new site, include nav, hero, at least one middle section, cta, and footer, with content specific to what the user described.

When editing an existing site, you will be given the current sections and theme as JSON. Return the FULL updated list of ALL sections in the same order (unless the user asked to add/remove one), and the full theme object. For any section NOT related to the user's request, copy its "data" EXACTLY as given — do not rewrite content the user did not ask to change. Only modify what was specifically requested.

Your explanation should teach the user something about *why* the change works (e.g. "I moved your phone number into the hero section since that's the first thing visitors see, which usually gets more calls") — this app is meant to help people learn as they build, not just receive a black box.`

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
      return NextResponse.json({ error: 'An active subscription is required to use the builder' }, { status: 403 })
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

    const { prompt, sections, theme, isNew } = await req.json()

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'A description is required' }, { status: 400 })
    }

    const currentTheme = theme ?? { primary: '#0A2342', accent: '#1a56db' }

    const userPrompt = isNew
      ? `Build a new website. The user wants: "${prompt}"`
      : `Edit the existing website. The user wants: "${prompt}"\n\nCurrent theme:\n${JSON.stringify(currentTheme)}\n\nCurrent sections:\n${JSON.stringify(sections ?? [])}`

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) throw new Error('No response from model')

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.sections)) throw new Error('Model did not return a sections array')

    const cleaned = parsed.sections.filter((s: any) => SECTION_TYPES.includes(s?.type))

    const HEX_RE = /^#[0-9a-fA-F]{6}$/
    const theme_out = {
      primary: HEX_RE.test(parsed.theme?.primary) ? parsed.theme.primary : currentTheme.primary,
      accent: HEX_RE.test(parsed.theme?.accent) ? parsed.theme.accent : currentTheme.accent,
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
      theme: theme_out,
      sections: cleaned,
      creditsRemaining,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
