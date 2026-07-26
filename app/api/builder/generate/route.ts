import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getOpenAI, SECTION_TYPES, type Section } from '@/lib/openai'
import { searchImage } from '@/lib/unsplash'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { hasBuilderAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'

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
- gallery: { "title": string, "g1img": string, "g2img": string, "g3img": string, "g4img": string, "g5img": string, "g6img": string } (2-6 images; omit/empty unused slots rather than always filling all 6)
- team: { "title": string, "m1img": string, "m1n": string, "m1r": string, "m2img": string, "m2n": string, "m2r": string, "m3img": string, "m3n": string, "m3r": string } (up to 3 members: photo, name, role/title)
- faq: { "title": string, "q1q": string, "q1a": string, "q2q": string, "q2a": string, "q3q": string, "q3a": string, "q4q": string, "q4a": string } (up to 4 question/answer pairs; omit unused ones)
- contact: { "title": string, "sub": string, "email": string, "phone": string, "address": string } (a "get in touch" section with contact details; do not invent a real phone/email/address the user never gave you — leave those fields empty rather than making something up, and say so in your explanation)
- map: { "title": string, "address": string } (embeds a map for the given address — only use this if the user gave you a real address; never invent one)
- logos: { "title": string, "l1n": string, "l2n": string, "l3n": string, "l4n": string, "l5n": string, "l6n": string } (a row of client/partner names, text only — there's no logo image search, so only use this if the user tells you real names to feature)

Image fields (hero.image; features.f1img/f2img/f3img; gallery.g1img-g6img; team.m1img/m2img/m3img) are OPTIONAL. When the user wants an image, set the field to a short, specific search phrase describing the photo (2-6 words, e.g. "cozy bakery storefront morning light") — NOT a URL. This phrase is used to automatically find a real, matching stock photo, so make it concrete and visual (subject + setting/mood), not colors — color matching isn't part of the search. For team member photos, search for a generic professional headshot style (e.g. "smiling professional headshot man") since there's no way to find a photo of a specific real person. Leave the field empty/omitted if no image was requested.

If the user attached a real image (you'll be told its URL directly), use that exact URL as the image field value for whichever section makes the most sense given their message — this is a real uploaded photo, not a placeholder, so prefer it over a placehold.co URL. If they attached a video or audio file, there's no section field to embed it in yet — don't invent one; just acknowledge in your explanation that the file was uploaded and give back its URL so they can use it elsewhere in the meantime.

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

    const {
      prompt,
      sections,
      theme,
      isNew,
      businessName,
      businessCategory,
      businessHours,
      businessLocation,
      attachmentUrl,
      attachmentKind,
    } = await req.json()

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'A description is required' }, { status: 400 })
    }

    const currentTheme = theme ?? { primary: '#0A2342', accent: '#1a56db' }

    // Persistent per-site facts, injected on every request so the user never
    // has to repeat their business name/category/hours/location or brand
    // colors mid-conversation — Zeus just already knows them.
    const profileLines = [
      businessName && `Business name: ${businessName}`,
      businessCategory && `Category: ${businessCategory}`,
      businessLocation && `Location: ${businessLocation}`,
      businessHours && `Hours: ${businessHours}`,
      `Brand colors: primary ${currentTheme.primary}, accent ${currentTheme.accent}`,
    ].filter(Boolean)
    const businessContext = `Business context — use this to inform tone, content, and defaults; don't ask the user to repeat it:\n${profileLines.join('\n')}`

    const attachmentLine =
      typeof attachmentUrl === 'string' && attachmentUrl
        ? `\n\nThe user attached a real ${attachmentKind} file at this URL: ${attachmentUrl}`
        : ''

    const userPrompt = isNew
      ? `${businessContext}${attachmentLine}\n\nBuild a new website. The user wants: "${prompt}"`
      : `${businessContext}${attachmentLine}\n\nEdit the existing website. The user wants: "${prompt}"\n\nCurrent theme:\n${JSON.stringify(currentTheme)}\n\nCurrent sections:\n${JSON.stringify(sections ?? [])}`

    // gpt-4o-mini's 128k-token context has to fit the system prompt, this prompt, and the
    // response. A site that has grown very large (many sections/edits) can blow past that;
    // fail fast with an actionable message rather than burning a request on a doomed call.
    const roughTokenEstimate = (SYSTEM_PROMPT.length + userPrompt.length) / 4
    if (roughTokenEstimate > 100_000) {
      return NextResponse.json(
        {
          error:
            "Your site has grown too large for the AI to edit in one go. Try removing a few sections you no longer need, then ask again.",
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
              "Your site has grown too large for the AI to edit in one go. Try removing a few sections you no longer need, then ask again.",
          },
          { status: 400 }
        )
      }
      throw err
    }

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

    const resolvedSections = await resolveImageFields(cleaned, theme_out)

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
      sections: resolvedSections,
      creditsRemaining,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Which data fields on each section type hold an image. The model is
// prompted to put a short search phrase in these fields (not a URL); we
// resolve that phrase to a real photo here rather than trusting the model
// to know actual image URLs.
const IMAGE_FIELDS: Partial<Record<Section['type'], string[]>> = {
  hero: ['image'],
  features: ['f1img', 'f2img', 'f3img'],
  gallery: ['g1img', 'g2img', 'g3img', 'g4img', 'g5img', 'g6img'],
  team: ['m1img', 'm2img', 'm3img'],
}

async function resolveImageFields(
  sections: Section[],
  theme: { primary: string; accent: string }
): Promise<Section[]> {
  return Promise.all(
    sections.map(async (section) => {
      const fields = IMAGE_FIELDS[section.type]
      if (!fields) return section

      const data = { ...section.data }
      await Promise.all(
        fields.map(async (field) => {
          const value = data[field]
          // Empty, or already a real URL (e.g. a user-attached photo the
          // model was told to pass through as-is) — leave untouched.
          if (!value || value.startsWith('http')) return

          const realPhoto = await searchImage(value)
          data[field] =
            realPhoto ??
            `https://placehold.co/800x500/${theme.primary.slice(1)}/ffffff?text=${encodeURIComponent(value)}`
        })
      )
      return { ...section, data }
    })
  )
}
