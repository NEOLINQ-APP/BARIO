import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getOpenAI, SECTION_TYPES, type Section } from '@/lib/openai'
import { searchImage } from '@/lib/unsplash'
import { STYLE_PRESETS, STYLE_PRESET_KEYS, DEFAULT_STYLE_PRESET, isStylePresetKey } from '@/lib/stylePresets'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { hasBuilderAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'

type Page = { name: string; slug: string; sections: Section[] }

// No route in this app set this before, so every AI call ran on Vercel's
// platform default duration. Usually fine for this route's compact JSON
// output, but worth the same headroom as generate-html for consistency and
// to handle occasional slow OpenAI responses without the function getting
// killed mid-flight (which sends no response at all — the client just hangs).
export const maxDuration = 60

const SYSTEM_PROMPT = `You are Zeus, the AI website builder inside Bario, a tool that helps small businesses build websites without writing code.

You build and edit REAL MULTI-PAGE websites — not one long scrolling page. A site is a list of pages; each page has a name (e.g. "Home", "About", "Services"), a URL slug (lowercase, hyphenated, no leading/trailing slash — the Home page's slug is always the empty string ""), and its own list of sections. Visitors navigate between pages via real links, not by scrolling. There is no cap on how many pages a site can have — build as many as the business genuinely needs, whether that's 3 or 30.

Pages can be NESTED under one another: a slug containing "/" makes that page a child of the page whose slug is the part before the last "/" — e.g. slug "services/plumbing-repair" is a child of the page with slug "services". Nesting can go as many levels deep as the business's actual structure calls for (a child can have its own children the same way) — use this whenever a business has multiple distinct items under one category (several services, several product lines, several locations, etc.) rather than cramming them all into one crowded page or one long list. Only TOP-LEVEL pages (slug with no "/") appear automatically in the site's main nav — nested sub-pages are reached via a "pagelinks" section placed on their parent page (and directly by URL). Every page, at any nesting depth, still needs its own nav + footer section like any other page.

Every page should start with a "nav" section and end with a "footer" section, so navigation and footer are consistent site-wide — you do NOT write the nav's links yourself (they're generated automatically from the site's actual page list), you only provide the nav's logo text. Put real, page-specific content in the sections between nav and footer.

The allowed section types and their data fields (same schema on every page) are:

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
- pagelinks: { "title": string, "c1n": string, "c1s": string, "c1d": string, "c1img": string, "c2n"/"c2s"/"c2d"/"c2img", ... up to c6 } (up to 6 cards, each linking to another page on this site — c*n is the card title, c*s is the exact "slug" value of the page it links to, c*d is a one-line description, c*img is an optional photo; omit unused slots. Use this on a category/parent page to link out to its own dedicated sub-pages — see the multi-page and nesting guidance below)

Image fields (hero.image; features.f1img/f2img/f3img; gallery.g1img-g6img; team.m1img/m2img/m3img) are OPTIONAL. When the user wants an image, set the field to a short, specific search phrase describing the photo (2-6 words, e.g. "cozy bakery storefront morning light") — NOT a URL. This phrase is used to automatically find a real, matching stock photo, so make it concrete and visual (subject + setting/mood), not colors — color matching isn't part of the search. For team member photos, search for a generic professional headshot style (e.g. "smiling professional headshot man") since there's no way to find a photo of a specific real person. Leave the field empty/omitted if no image was requested.

If the user attached a real image (you'll be told its URL directly), use that exact URL as the image field value for whichever section on whichever page makes the most sense given their message — this is a real uploaded photo, not a placeholder, so prefer it over a placehold.co URL. If they attached a video or audio file, there's no section field to embed it in yet — don't invent one; just acknowledge in your explanation that the file was uploaded and give back its URL so they can use it elsewhere in the meantime.

Theme: every response also includes a "theme" object: { "primary": "#hex", "accent": "#hex", "style": "preset-key" }. Default is { "primary": "#0A2342", "accent": "#1a56db", "style": "modern" }. When the user asks to change colors, set new hex values here — this is the ONLY way colors change, there is no per-section color field. When editing and colors were NOT mentioned, copy the existing theme values unchanged. Theme applies to the whole site (every page), not per-page.

"style" picks the site's overall visual personality — fonts, corner rounding, shadows vs. borders, button shape. It is NOT a per-section or per-page setting; one value themes the whole site. The options are:
${STYLE_PRESET_KEYS.map((k) => `- "${k}": ${STYLE_PRESETS[k].vibe}`).join('\n')}

When building a NEW site, pick whichever preset best fits the business described (e.g. a law firm or wedding venue → elegant; a gym or nightclub → bold; a dev tool or architecture studio → minimal; a daycare or pet groomer → friendly; anything else → modern). When EDITING an existing site, keep the current style unless the user explicitly asks for a different look/vibe/style — never change it just because they asked to edit text or colors.

Always respond with a single JSON object of the shape:
{
  "explanation": "one or two plain-language sentences, written for someone with no coding background, explaining what you built or changed and why",
  "theme": { "primary": "#hex", "accent": "#hex" },
  "pages": [
    { "name": "Home", "slug": "", "sections": [ { "type": "...", "data": { ... } }, ... ] },
    { "name": "About", "slug": "about", "sections": [ ... ] },
    { "name": "Plumbing Repair", "slug": "services/plumbing-repair", "sections": [ ... ] },
    ...
  ]
}

When building a NEW site: plan out a real multi-page site with as many pages as the business actually needs — there's no fixed count or cap to pad to or stay under. A simple business might only need 3-5 pages (always include a "Home" page with slug ""; pick the rest from what actually fits, e.g. About, Services, Menu, Gallery, Pricing, Contact — don't force a page that doesn't make sense). A business with many distinct offerings (a dozen service types, several product categories, multiple locations) should get one dedicated page PER offering, organized hierarchically: one top-level parent page for the category (e.g. "Services", slug "services") carrying a "pagelinks" section that fans out to each specific sub-page (e.g. "services/plumbing-repair", "services/drain-cleaning"), and each of those gets its own real page with full content. Distribute content sensibly: the Home page should be a strong overview/landing page (nav, hero, a couple of highlight sections, cta, footer) — it should NOT contain everything; move a full pricing table to a dedicated pricing/services page, a full FAQ to its own page or the most relevant one, a full team section to an About page, etc. Every page needs its own nav (logo only) and footer.

When EDITING an existing site: you'll be given the full current "pages" array and which page the user is currently viewing ("activeSlug"). By default, apply the user's requested change to sections on the CURRENTLY VIEWED page only — unless the user's message clearly names a different existing page ("update the Contact page's phone number"), asks to add/rename/remove a page, or asks for something that's inherently site-wide in scope (e.g. "split my services into their own pages", "reorganize the whole site", "add a page for each of our locations") — in any of those cases, act across whatever pages the request actually touches, not just the active one. Return the FULL updated "pages" array (every page, in the same order, same slugs unless a page was explicitly added/removed/renamed/restructured) — for any page or section NOT related to the user's request, copy its data EXACTLY as given, do not rewrite content the user did not ask to change. Only modify what was specifically requested.

Your explanation should teach the user something about *why* the change works (e.g. "I moved your phone number into the hero section since that's the first thing visitors see, which usually gets more calls") — this app is meant to help people learn as they build, not just receive a black box.`

// Reads the model's own proposed slug (which may contain "/" to nest a page
// under another one, e.g. "services/plumbing-repair") and sanitizes it
// segment-by-segment, falling back to a name-derived slug if the model left
// it out or returned garbage. Dedupes on the full path so two different
// parents can each have a child slug that resolves to the same leaf name
// (e.g. "services/repair" and "products/repair" don't collide).
function sanitizeSlug(rawSlug: unknown, name: string, index: number, existing: Set<string>): string {
  if (index === 0) {
    existing.add('')
    return ''
  }
  const segments = String(rawSlug ?? '')
    .toLowerCase()
    .split('/')
    .map((seg) => seg.trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
  const base =
    segments.length > 0
      ? segments.join('/')
      : name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `page-${index}`
  let slug = base
  let n = 2
  while (existing.has(slug)) {
    slug = `${base}-${n}`
    n++
  }
  existing.add(slug)
  return slug
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

    const {
      prompt,
      pages,
      activeSlug,
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

    const currentPages: Page[] = Array.isArray(pages) ? pages : []

    const currentTheme = {
      primary: theme?.primary ?? '#0A2342',
      accent: theme?.accent ?? '#1a56db',
      style: isStylePresetKey(theme?.style) ? theme.style : DEFAULT_STYLE_PRESET,
    }

    // Persistent per-site facts, injected on every request so the user never
    // has to repeat their business name/category/hours/location or brand
    // colors mid-conversation — Zeus just already knows them.
    const profileLines = [
      businessName && `Business name: ${businessName}`,
      businessCategory && `Category: ${businessCategory}`,
      businessLocation && `Location: ${businessLocation}`,
      businessHours && `Hours: ${businessHours}`,
      `Brand colors: primary ${currentTheme.primary}, accent ${currentTheme.accent}`,
      `Current style: ${currentTheme.style}`,
    ].filter(Boolean)
    const businessContext = `Business context — use this to inform tone, content, and defaults; don't ask the user to repeat it:\n${profileLines.join('\n')}`

    const attachmentLine =
      typeof attachmentUrl === 'string' && attachmentUrl
        ? `\n\nThe user attached a real ${attachmentKind} file at this URL: ${attachmentUrl}`
        : ''

    const userPrompt = isNew
      ? `${businessContext}${attachmentLine}\n\nBuild a new website. The user wants: "${prompt}"`
      : `${businessContext}${attachmentLine}\n\nEdit the existing website. The user wants: "${prompt}"\n\nCurrently viewing page (slug): "${activeSlug ?? ''}"\n\nCurrent theme:\n${JSON.stringify(currentTheme)}\n\nCurrent pages:\n${JSON.stringify(currentPages)}`

    // gpt-4o-mini's 128k-token context has to fit the system prompt, this prompt, and the
    // response. A site that has grown very large (many pages/sections/edits) can blow past
    // that; fail fast with an actionable message rather than burning a request on a doomed call.
    const roughTokenEstimate = (SYSTEM_PROMPT.length + userPrompt.length) / 4
    if (roughTokenEstimate > 100_000) {
      return NextResponse.json(
        {
          error:
            "Your site has grown too large for the AI to edit in one go. Try removing a few sections or pages you no longer need, then ask again.",
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
              "Your site has grown too large for the AI to edit in one go. Try removing a few sections or pages you no longer need, then ask again.",
          },
          { status: 400 }
        )
      }
      throw err
    }

    const raw = completion.choices[0]?.message?.content
    if (!raw) throw new Error('No response from model')

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) throw new Error('Model did not return a pages array')

    const usedSlugs = new Set<string>()
    const cleanedPages: Page[] = parsed.pages.map((p: any, i: number) => {
      const name = typeof p?.name === 'string' && p.name.trim() ? p.name.trim() : i === 0 ? 'Home' : `Page ${i + 1}`
      const sections = Array.isArray(p?.sections) ? p.sections.filter((s: any) => SECTION_TYPES.includes(s?.type)) : []
      const slug = sanitizeSlug(p?.slug, name, i, usedSlugs)
      return { name, slug, sections }
    })

    // pagelinks cards reference another page by its slug — normalize away an
    // accidental leading slash or stray whitespace so a card the model meant
    // to work actually resolves, without hard-rejecting anything (a
    // mismatched link here is the same class of risk as any other
    // AI-authored copy, not worth failing the whole generation over).
    for (const page of cleanedPages) {
      for (const section of page.sections) {
        if (section.type !== 'pagelinks') continue
        for (let n = 1; n <= 6; n++) {
          const key = `c${n}s`
          if (section.data[key]) {
            section.data[key] = section.data[key].trim().replace(/^\/+/, '').toLowerCase()
          }
        }
      }
    }

    const HEX_RE = /^#[0-9a-fA-F]{6}$/
    const theme_out = {
      primary: HEX_RE.test(parsed.theme?.primary) ? parsed.theme.primary : currentTheme.primary,
      accent: HEX_RE.test(parsed.theme?.accent) ? parsed.theme.accent : currentTheme.accent,
      style: isStylePresetKey(parsed.theme?.style) ? parsed.theme.style : currentTheme.style,
    }

    const resolvedPages = await resolveImageFields(cleanedPages, theme_out)

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
      pages: resolvedPages,
      creditsRemaining,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Which data fields on each section type hold an image, and how to search
// for them. The model is prompted to put a short search phrase in these
// fields (not a URL); we resolve that phrase to a real photo here rather
// than trusting the model to know actual image URLs. Team photos need a
// squarish, face-cropped search — they render in a small circle, and a
// landscape photo crammed into a circle tends to cut off the top of the
// head or miss the face entirely.
const IMAGE_FIELDS: Partial<Record<Section['type'], { fields: string[]; options?: Parameters<typeof searchImage>[1] }>> = {
  hero: { fields: ['image'] },
  features: { fields: ['f1img', 'f2img', 'f3img'] },
  gallery: { fields: ['g1img', 'g2img', 'g3img', 'g4img', 'g5img', 'g6img'] },
  team: { fields: ['m1img', 'm2img', 'm3img'], options: { orientation: 'squarish', faceCrop: true } },
  pagelinks: { fields: ['c1img', 'c2img', 'c3img', 'c4img', 'c5img', 'c6img'] },
}

async function resolveImageFieldsForSections(
  sections: Section[],
  theme: { primary: string; accent: string }
): Promise<Section[]> {
  return Promise.all(
    sections.map(async (section) => {
      const config = IMAGE_FIELDS[section.type]
      if (!config) return section

      const data = { ...section.data }
      await Promise.all(
        config.fields.map(async (field) => {
          const value = data[field]
          // Empty, or already a real URL (e.g. a user-attached photo the
          // model was told to pass through as-is) — leave untouched.
          if (!value || value.startsWith('http')) return

          const realPhoto = await searchImage(value, config.options)
          data[field] =
            realPhoto ??
            `https://placehold.co/800x500/${theme.primary.slice(1)}/ffffff?text=${encodeURIComponent(value)}`
        })
      )
      return { ...section, data }
    })
  )
}

async function resolveImageFields(pages: Page[], theme: { primary: string; accent: string }): Promise<Page[]> {
  return Promise.all(
    pages.map(async (page) => ({ ...page, sections: await resolveImageFieldsForSections(page.sections, theme) }))
  )
}
