import { NextResponse } from 'next/server'
import { generateObject, NoObjectGeneratedError } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { type Section } from '@/lib/openai'
import { searchImage } from '@/lib/unsplash'
import { STYLE_PRESETS, STYLE_PRESET_KEYS, DEFAULT_STYLE_PRESET, isStylePresetKey } from '@/lib/stylePresets'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { hasBuilderAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'

// Schema-validated generation (via the Vercel AI SDK's generateObject)
// replaces the old raw chat.completions.create + JSON.parse approach.
// Two concrete wins this closes: (1) a response that doesn't match this
// shape now gets automatically re-asked with the validation error fed back
// to the model, instead of a single-shot JSON.parse that either succeeds or
// throws with no repair attempt; (2) "theme"/"pages" can no longer come
// back subtly wrong-shaped (e.g. a missing field) without being caught
// before it ever reaches a customer's site.
//
// `data` is a discriminated union keyed by `type` — one closed object shape
// per section type — rather than an open `z.record()`. That's not a style
// preference: Claude's strict tool-schema mode rejects `additionalProperties`
// with a nested schema outright (400), and the Vercel AI SDK's Anthropic
// provider silently downgrades an open record to `additionalProperties:
// false` with no declared properties, which makes every `data` field
// impossible to fill — the model still writes a normal explanation, but
// every section comes back empty. A closed schema per type sidesteps both
// failure modes and works identically on OpenAI's strict mode too.
// Every field is a required string, not `.optional()` — a JSON-Schema
// "optional" property (absent from `required`) is what OpenAI's real strict
// mode disallows (it demands every property be listed as required, using
// empty/null values for the ones that don't apply), so required-with-empty-
// string is the one shape that's portable across both providers' strict
// modes. It also matches what renderSite.ts already does: every "is this
// slot used" check is a truthy check (`data.g1img ?`), so an empty string
// and an absent key render identically — no behavior change from before.
const navData = z.object({ logo: z.string() })
const heroData = z.object({ headline: z.string(), sub: z.string(), cta: z.string(), image: z.string() })
const featuresData = z.object({
  title: z.string(),
  f1t: z.string(), f1d: z.string(), f1img: z.string(),
  f2t: z.string(), f2d: z.string(), f2img: z.string(),
  f3t: z.string(), f3d: z.string(), f3img: z.string(),
})
const statsData = z.object({
  s1n: z.string(), s1l: z.string(), s2n: z.string(), s2l: z.string(),
  s3n: z.string(), s3l: z.string(), s4n: z.string(), s4l: z.string(),
})
const testimonialData = z.object({
  title: z.string(),
  t1q: z.string(), t1n: z.string(), t1r: z.string(),
  t2q: z.string(), t2n: z.string(), t2r: z.string(),
  t3q: z.string(), t3n: z.string(), t3r: z.string(),
})
const pricingData = z.object({
  title: z.string(),
  p1n: z.string(), p1p: z.string(), p1f: z.string(),
  p2n: z.string(), p2p: z.string(), p2f: z.string(),
  p3n: z.string(), p3p: z.string(), p3f: z.string(),
})
const ctaData = z.object({ headline: z.string(), sub: z.string(), cta: z.string() })
const footerData = z.object({ logo: z.string(), copy: z.string() })
const galleryData = z.object({
  title: z.string(),
  g1img: z.string(), g2img: z.string(), g3img: z.string(),
  g4img: z.string(), g5img: z.string(), g6img: z.string(),
})
const teamData = z.object({
  title: z.string(),
  m1img: z.string(), m1n: z.string(), m1r: z.string(),
  m2img: z.string(), m2n: z.string(), m2r: z.string(),
  m3img: z.string(), m3n: z.string(), m3r: z.string(),
})
const faqData = z.object({
  title: z.string(),
  q1q: z.string(), q1a: z.string(),
  q2q: z.string(), q2a: z.string(),
  q3q: z.string(), q3a: z.string(),
  q4q: z.string(), q4a: z.string(),
})
const contactData = z.object({ title: z.string(), sub: z.string(), email: z.string(), phone: z.string(), address: z.string() })
const mapData = z.object({ title: z.string(), address: z.string() })
const logosData = z.object({
  title: z.string(),
  l1n: z.string(), l2n: z.string(), l3n: z.string(),
  l4n: z.string(), l5n: z.string(), l6n: z.string(),
})
const pagelinksData = z.object({
  title: z.string(),
  c1n: z.string(), c1s: z.string(), c1d: z.string(), c1img: z.string(),
  c2n: z.string(), c2s: z.string(), c2d: z.string(), c2img: z.string(),
  c3n: z.string(), c3s: z.string(), c3d: z.string(), c3img: z.string(),
  c4n: z.string(), c4s: z.string(), c4d: z.string(), c4img: z.string(),
  c5n: z.string(), c5s: z.string(), c5d: z.string(), c5img: z.string(),
  c6n: z.string(), c6s: z.string(), c6d: z.string(), c6img: z.string(),
})

const sectionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('nav'), data: navData }),
  z.object({ type: z.literal('hero'), data: heroData }),
  z.object({ type: z.literal('features'), data: featuresData }),
  z.object({ type: z.literal('stats'), data: statsData }),
  z.object({ type: z.literal('testimonial'), data: testimonialData }),
  z.object({ type: z.literal('pricing'), data: pricingData }),
  z.object({ type: z.literal('cta'), data: ctaData }),
  z.object({ type: z.literal('footer'), data: footerData }),
  z.object({ type: z.literal('gallery'), data: galleryData }),
  z.object({ type: z.literal('team'), data: teamData }),
  z.object({ type: z.literal('faq'), data: faqData }),
  z.object({ type: z.literal('contact'), data: contactData }),
  z.object({ type: z.literal('map'), data: mapData }),
  z.object({ type: z.literal('logos'), data: logosData }),
  z.object({ type: z.literal('pagelinks'), data: pagelinksData }),
])

const pageSchema = z.object({
  name: z.string(),
  slug: z.string(),
  sections: z.array(sectionSchema),
})

const HEX_RE = /^#[0-9a-fA-F]{6}$/
const responseSchema = z.object({
  explanation: z.string(),
  theme: z.object({
    primary: z.string().regex(HEX_RE),
    accent: z.string().regex(HEX_RE),
    style: z.string().refine(isStylePresetKey),
    backgroundStyle: z.enum(['solid', 'gradient']),
  }),
  pages: z.array(pageSchema).min(1),
})

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
- gallery: { "title": string, "g1img": string, "g2img": string, "g3img": string, "g4img": string, "g5img": string, "g6img": string } (2-6 images; every field must be present, but set any unused slot to an empty string "" rather than always filling all 6)
- team: { "title": string, "m1img": string, "m1n": string, "m1r": string, "m2img": string, "m2n": string, "m2r": string, "m3img": string, "m3n": string, "m3r": string } (up to 3 members: photo, name, role/title — set an unused member's fields to empty strings)
- faq: { "title": string, "q1q": string, "q1a": string, "q2q": string, "q2a": string, "q3q": string, "q3a": string, "q4q": string, "q4a": string } (up to 4 question/answer pairs; set any unused pair's fields to empty strings)
- contact: { "title": string, "sub": string, "email": string, "phone": string, "address": string } (a "get in touch" section with contact details; do not invent a real phone/email/address the user never gave you — leave those fields as empty strings rather than making something up, and say so in your explanation)
- map: { "title": string, "address": string } (embeds a map for the given address — only use this if the user gave you a real address; never invent one)
- logos: { "title": string, "l1n": string, "l2n": string, "l3n": string, "l4n": string, "l5n": string, "l6n": string } (a row of client/partner names, text only — there's no logo image search, so only use this if the user tells you real names to feature; set any unused slot to an empty string)
- pagelinks: { "title": string, "c1n": string, "c1s": string, "c1d": string, "c1img": string, "c2n"/"c2s"/"c2d"/"c2img", ... up to c6 } (up to 6 cards, each linking to another page on this site — c*n is the card title, c*s is the exact "slug" value of the page it links to, c*d is a one-line description, c*img is a photo search phrase or empty string; set any unused card's fields to empty strings. Use this on a category/parent page to link out to its own dedicated sub-pages — see the multi-page and nesting guidance below)

Every field listed above is a required key in the JSON you return — never omit a key — but image fields (hero.image; features.f1img/f2img/f3img; gallery.g1img-g6img; team.m1img/m2img/m3img) and any "unused slot" field are OPTIONAL in effect: set them to an empty string "" when there's no image or no content for that slot. When the user wants an image, set the field to a short, specific search phrase describing the photo (2-6 words, e.g. "cozy bakery storefront morning light") — NOT a URL. This phrase is used to automatically find a real, matching stock photo, so make it concrete and visual (subject + setting/mood), not colors — color matching isn't part of the search. For team member photos, search for a generic professional headshot style (e.g. "smiling professional headshot man") since there's no way to find a photo of a specific real person. Leave the field as an empty string if no image was requested.

If the user attached a real image (you'll be told its URL directly), use that exact URL as the image field value for whichever section on whichever page makes the most sense given their message — this is a real uploaded photo, not a placeholder, so prefer it over a placehold.co URL. If they attached a video or audio file, there's no section field to embed it in yet — don't invent one; just acknowledge in your explanation that the file was uploaded and give back its URL so they can use it elsewhere in the meantime.

Theme: every response also includes a "theme" object: { "primary": "#hex", "accent": "#hex", "style": "preset-key", "backgroundStyle": "solid" | "gradient" }. Default is { "primary": "#0A2342", "accent": "#1a56db", "style": "modern", "backgroundStyle": "solid" }. When the user asks to change colors, set new hex values here — this is the ONLY way colors change, there is no per-section color field. When editing and colors were NOT mentioned, copy the existing theme values unchanged. Theme applies to the whole site (every page), not per-page.

"backgroundStyle" controls whether the hero, primary buttons, and other accent surfaces use a flat solid color or a gradient. Default to "solid" — it reads as more current and lets the brand colors themselves do the work instead of a gradient effect. Only use "gradient" when the user explicitly asks for something more vibrant/energetic/colorful, or for a business where that fits the vibe (nightlife, gaming, kids' entertainment). When editing and the look wasn't mentioned, keep the current value unchanged.

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
      // Undefined means a legacy site saved before this field existed, which
      // renders as 'gradient' by default (see backgroundVars in
      // lib/renderSite.ts) — matching that here means editing an old site
      // without mentioning colors can't silently flip its look to solid.
      // Brand-new sites explicitly send 'solid' via DEFAULT_THEME, so they
      // still start on the more modern default.
      backgroundStyle: theme?.backgroundStyle === 'solid' ? 'solid' : 'gradient',
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

    let parsed: z.infer<typeof responseSchema>
    try {
      const result = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: responseSchema,
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        // Section `data` fields vary per section type (hero vs. features vs.
        // pricing, etc.), so the schema uses an open-ended record rather
        // than one discriminated variant per section type. OpenAI's native
        // Structured Outputs mode requires every field pre-enumerated and
        // rejects open-ended records outright ("'propertyNames' is not
        // permitted") — this falls back to JSON mode with the schema
        // enforced client-side by the SDK instead (still validates/retries,
        // just not via OpenAI's own strict enforcement).
        providerOptions: { openai: { strictJsonSchema: false } },
      })
      parsed = result.object
    } catch (err: any) {
      if (err instanceof NoObjectGeneratedError) {
        return NextResponse.json(
          { error: "The AI couldn't put together a valid response for that — try rephrasing your request." },
          { status: 502 }
        )
      }
      if (err?.message?.includes('context_length') || err?.message?.includes('maximum context length')) {
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

    const usedSlugs = new Set<string>()
    const cleanedPages: Page[] = parsed.pages.map((p, i) => {
      const name = p.name.trim() ? p.name.trim() : i === 0 ? 'Home' : `Page ${i + 1}`
      const slug = sanitizeSlug(p.slug, name, i, usedSlugs)
      return { name, slug, sections: p.sections }
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

    // Schema already guarantees valid hex colors, a real style preset key,
    // and a valid backgroundStyle — no fallback-on-invalid needed anymore.
    const theme_out = parsed.theme

    // The model can (and did, in testing) describe a change in prose while
    // returning pages/theme byte-identical to what it was given — a
    // confident-sounding lie, not an edit. Compare BEFORE image resolution
    // (Unsplash search isn't deterministic across calls, so comparing after
    // would flag a true no-op as "changed" whenever an image field happens
    // to re-resolve to a different photo). Only applies to edits — a brand
    // new site has no "before" to match against.
    const nothingChanged = !isNew && JSON.stringify(cleanedPages) === JSON.stringify(currentPages) && JSON.stringify(theme_out) === JSON.stringify(currentTheme)

    const resolvedPages = await resolveImageFields(cleanedPages, theme_out)

    let creditsRemaining = -1
    if (!user.is_admin) {
      const creditRows = (await sql`
        UPDATE users SET credits_remaining = credits_remaining - 1 WHERE id = ${user.id}
        RETURNING credits_remaining
      `) as unknown as { credits_remaining: number }[]
      creditsRemaining = creditRows[0]?.credits_remaining ?? 0
    }

    const explanation = nothingChanged
      ? "I didn't actually make any changes there — your request may have been too vague for me to act on confidently, or already matched what's there. Try describing a specific, concrete change (e.g. a color, a headline, a new section) and I'll apply it."
      : typeof parsed.explanation === 'string' ? parsed.explanation : 'Done.'

    return NextResponse.json({
      explanation,
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
