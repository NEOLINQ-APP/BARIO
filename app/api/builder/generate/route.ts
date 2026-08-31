import { NextResponse } from 'next/server'
import { streamObject, NoObjectGeneratedError } from 'ai'
import { openai } from '@ai-sdk/openai'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { type Section } from '@/lib/openai'
import { searchImage } from '@/lib/unsplash'
import { isStylePresetKey } from '@/lib/stylePresets'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { hasZeusStudioAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'
import { checkThemeContrast, darkenUntilReadable } from '@/lib/contrastCheck'
import { type Page, SYSTEM_PROMPT, buildUserPrompt } from '@/lib/builderPrompt'

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
// `pages` first, `explanation` last — models generally fill a structured
// call's JSON keys in declared order, so putting the actual site content
// first means it's available to stream into the live preview (Builder.tsx)
// as early as possible, rather than after a paragraph of chat explanation
// nobody watches build character-by-character. Confirmed this reliably
// changes OpenAI's generation order (structured-output field order is a
// well-documented OpenAI behavior); verified live against Claude's tool-use
// path that it does NOT change Claude's order the same way — Claude wrote
// `explanation` first regardless of where it's declared here. Kept anyway
// since it's free and helps the OpenAI path; Claude's progressive reveal
// just has less to show during its explanation-writing phase.
const responseSchema = z.object({
  pages: z.array(pageSchema).min(1),
  theme: z.object({
    primary: z.string().regex(HEX_RE),
    accent: z.string().regex(HEX_RE),
    style: z.string().refine(isStylePresetKey),
    backgroundStyle: z.enum(['solid', 'gradient']),
  }),
  explanation: z.string(),
})

// A big multi-page build under the Claude path measured 45-65s in testing —
// raised well past that (matching sites/migrate's precedent for a
// legitimately slow route) so the function isn't killed mid-stream on a
// large request. The response streams progressively now anyway, so the
// client sees steady partial progress well before this ever matters.
export const maxDuration = 120

// Model selection — defaults to the OpenAI path that's run in production all
// along; set ZEUS_MODEL_PROVIDER=anthropic in Vercel to switch the builder over to
// Claude for A/B comparison without a code change either way.
const MODEL_PROVIDER: 'openai' | 'anthropic' = process.env.ZEUS_MODEL_PROVIDER === 'anthropic' ? 'anthropic' : 'openai'

const anthropicClient = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null

// Zod v4 exports a real JSON Schema directly, and — because every section
// type now has its own closed shape instead of an open z.record() — that
// export has no open dictionary left in it anywhere. That matters
// specifically for Claude: calling it through the Vercel AI SDK's
// generateObject forces Anthropic's strict tool-schema mode, and this
// schema (15 section-type variants, one with 24 fields) is large enough
// that Claude's strict-mode grammar compiler rejects it outright
// ("compiled grammar is too large"). Calling Claude directly instead (see
// generateWithClaude below) uses an ordinary, non-strict tool — no grammar
// compilation, so the size ceiling doesn't apply — at the cost of losing
// the SDK's built-in strict-schema guarantee, which we replace with an
// explicit zod validate-and-retry-once below.
const claudeToolSchema = z.toJSONSchema(responseSchema, { target: 'draft-07' }) as Anthropic.Tool.InputSchema

class ModelGenerationError extends Error {}

// `onPartial` fires repeatedly with whatever best-effort partial shape of the
// response is available so far, so the route can stream it straight to the
// client and let pages appear progressively as they're built — instead of
// one long blank wait followed by an instant full-site swap. Every partial
// object is throwaway/unvalidated (it's mid-generation, so required fields
// may still be missing); only the final returned value is ever treated as
// authoritative.
type PartialResponse = Partial<{ explanation: string; theme: unknown; pages: unknown[] }>

async function generateWithClaude(userPrompt: string, onPartial: (partial: PartialResponse) => void): Promise<z.infer<typeof responseSchema>> {
  if (!anthropicClient) throw new ModelGenerationError('ANTHROPIC_API_KEY is not configured')

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }]

  for (let attempt = 0; attempt < 2; attempt++) {
    const stream = anthropicClient.messages.stream({
      model: 'claude-sonnet-5',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages,
      tools: [{ name: 'build_site', description: 'Build or edit the website structure.', input_schema: claudeToolSchema }],
      tool_choice: { type: 'tool', name: 'build_site' },
    })
    // The SDK does its own best-effort partial-JSON parsing internally as
    // the tool's input streams in and hands back a snapshot each time —
    // no need to buffer/parse the raw JSON deltas ourselves.
    stream.on('inputJson', (_partialJson, jsonSnapshot) => {
      if (jsonSnapshot && typeof jsonSnapshot === 'object') onPartial(jsonSnapshot as PartialResponse)
    })

    const finalMsg = await stream.finalMessage()
    const toolUse = finalMsg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!toolUse) throw new ModelGenerationError('Claude did not return a tool call')

    const validated = responseSchema.safeParse(toolUse.input)
    if (validated.success) return validated.data

    if (attempt === 0) {
      // One repair attempt, same idea generateObject already gives the
      // OpenAI path for free: echo the assistant's tool call back and tell
      // it exactly what was wrong, then let it try again.
      messages.push(
        { role: 'assistant', content: finalMsg.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `That didn't match the required shape: ${validated.error.message}. Call build_site again with a corrected input.`,
              is_error: true,
            },
          ],
        }
      )
      continue
    }
    throw new ModelGenerationError('Claude could not produce a valid response after a retry')
  }
  throw new ModelGenerationError('Claude could not produce a valid response')
}

// Gemini — backup generator + reviewer (2026-08-21, explicit user request,
// see the Luna-primary/Gemini-backup-and-reviewer pipeline they specified).
// Raw fetch to Gemini's REST API rather than the @ai-sdk/google package
// (not installed) or the @google/genai SDK (installed but unused anywhere
// in this codebase, so there's no proven working call-shape to copy, and no
// way to test it locally — GEMINI_API_KEY is a Sensitive Vercel env var
// that reads back empty). This exact raw-fetch pattern is already
// live-verified working multiple times today on Victoria's phone pilot.
// No native structured-output schema enforcement — this schema is already
// documented above as large enough to break Claude's strict-mode grammar
// compiler, so the same defensive choice applies here: plain JSON-in-prompt
// + zod validate-and-retry, same as generateWithClaude.
const GEMINI_RESPONSE_SHAPE_INSTRUCTIONS = `Respond with ONLY a single raw JSON object (no markdown code fences, no preamble, no explanation outside the JSON) matching exactly this shape:
{
  "explanation": "one or two plain-language sentences",
  "theme": { "primary": "#hex", "accent": "#hex", "style": "preset-key-string", "backgroundStyle": "solid" or "gradient" },
  "pages": [ { "name": "...", "slug": "...", "sections": [ { "type": "...", "data": { ... } }, ... ] }, ... ]
}`

async function callGemini(systemPrompt: string, userContent: string): Promise<z.infer<typeof responseSchema>> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new ModelGenerationError('GEMINI_API_KEY is not configured')

  let lastError: string | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const promptText = lastError
      ? `${userContent}\n\nYour previous response didn't match the required shape: ${lastError}. Return a corrected JSON object, still following the shape instructions exactly.`
      : userContent

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        systemInstruction: { parts: [{ text: `${systemPrompt}\n\n${GEMINI_RESPONSE_SHAPE_INSTRUCTIONS}` }] },
        generationConfig: { maxOutputTokens: 16000, thinkingConfig: { thinkingLevel: 'low' } },
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new ModelGenerationError(data?.error?.message ?? `Gemini ${res.status}`)

    const raw = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text || '').join('')
    let json: unknown
    try {
      json = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''))
    } catch {
      lastError = 'response was not valid JSON'
      continue
    }
    const validated = responseSchema.safeParse(json)
    if (validated.success) return validated.data
    lastError = validated.error.message
  }
  throw new ModelGenerationError('Gemini could not produce a valid response after a retry')
}

async function generateWithGemini(userPrompt: string, onPartial: (partial: PartialResponse) => void): Promise<z.infer<typeof responseSchema>> {
  const result = await callGemini(SYSTEM_PROMPT, userPrompt)
  onPartial(result)
  return result
}

// Review pass — runs after Luna succeeds, never blocks the response: any
// error here is caught by the caller and just means the unreviewed Luna
// output ships as-is. Not a rebuild — told explicitly to copy everything
// through unchanged except for real, specific problems (invented contact
// info, empty fields that should have content, a broken pagelinks slug).
const GEMINI_REVIEW_SYSTEM_PROMPT = `You are reviewing a website another AI just built for Bario, a website-builder tool for small businesses, to catch real quality issues before it ships to the customer. You are NOT rebuilding it from scratch — copy everything through byte-for-byte unchanged except where you find a genuine, specific problem, such as: an invented phone number/email/address the business never actually gave you (should be an empty string instead, never a fabricated one), generic template filler copy that doesn't sound like a real business wrote it for their own site, a required field left empty that clearly should have real content given the business context, or a "pagelinks" card whose slug doesn't match any real page in this same site. If you find no real issues, return the input completely unchanged. Return the FULL corrected site in the exact same JSON shape you were given — never omit a page, section, or field that was already there.`

async function reviewWithGemini(originalUserPrompt: string, generated: z.infer<typeof responseSchema>): Promise<z.infer<typeof responseSchema>> {
  const reviewInput = `Original request this site was built from:\n${originalUserPrompt}\n\nGenerated site to review:\n${JSON.stringify(generated)}`
  return callGemini(GEMINI_REVIEW_SYSTEM_PROMPT, reviewInput)
}

async function generateWithOpenAI(userPrompt: string, onPartial: (partial: PartialResponse) => void): Promise<z.infer<typeof responseSchema>> {
  const result = streamObject({
    model: openai('gpt-5.6-luna'),
    schema: responseSchema,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    // strictJsonSchema:false is no longer load-bearing for the open-record
    // problem (the schema is closed now), but keeping it off still avoids
    // paying for OpenAI's own strict-mode compile step we don't need here.
    // reasoningEffort (2026-08-30) — this was the only gpt-5.6-luna call
    // anywhere in the codebase with no reasoning-effort override at all;
    // every other one hit the same slow/unpredictable-latency problem and
    // needed one set explicitly (see app/api/studio/copilot/route.ts,
    // app/api/public/drivers-exam-assist/route.ts — both use 'none' for
    // fast classification-style calls). Confirmed live: a real 4-page,
    // image-heavy build with no override here took anywhere from 34s to
    // over 5 minutes across 5 back-to-back identical test requests, still
    // streaming (not stuck) the whole time — genuinely unpredictable
    // reasoning-depth variance, not a hang. 'low' (not 'none') because this
    // call does real compositional work an intent-classifier doesn't —
    // page structure, style-preset choice, business-specific copywriting —
    // so some reasoning budget is worth keeping, just not an unbounded one.
    providerOptions: { openai: { strictJsonSchema: false, reasoningEffort: 'low' } },
  })
  for await (const partial of result.partialObjectStream) {
    onPartial(partial as PartialResponse)
  }
  return result.object
}

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
    if (!user || !hasZeusStudioAccess(user)) {
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
      explicitStyle,
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

    const { userPrompt, currentPages, currentTheme } = buildUserPrompt({
      prompt, pages, activeSlug, theme, isNew,
      explicitStyle: isStylePresetKey(explicitStyle) ? explicitStyle : null,
      businessName, businessCategory, businessHours, businessLocation, attachmentUrl, attachmentKind,
    })

    // gpt-5.6-luna's 1.05M-token context comfortably fits the system prompt, this prompt, and
    // the response for any realistically-sized site, but an extremely large one (many
    // pages/sections/edits) could still blow past it; fail fast with an actionable message
    // rather than burning a request on a doomed call.
    const roughTokenEstimate = (SYSTEM_PROMPT.length + userPrompt.length) / 4
    if (roughTokenEstimate > 800_000) {
      return NextResponse.json(
        {
          error:
            "Your site has grown too large for the AI to edit in one go. Try removing a few sections or pages you no longer need, then ask again.",
        },
        { status: 400 }
      )
    }

    // From here on, generation + post-processing streams back progressively
    // as newline-delimited JSON (`{type:'partial'}` events, then one final
    // `{type:'done'}` or `{type:'error'}`) instead of a single blocking JSON
    // response — a multi-page build can take 30-60s, and a blank wait
    // followed by an instant full-site swap reads as broken even when it
    // isn't. The HTTP status is committed to 200 the moment streaming
    // starts, so any failure past this point is signaled via an `error`
    // line rather than a different status code — the client checks for that
    // line explicitly instead of `res.ok`.
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
        try {
          // Phase labels (2026-08-21) — the Gemini review step added above
          // was previously invisible to the user: a few real extra seconds
          // of wait with no indication anything was happening beyond the
          // normal build. These map onto what this route actually does
          // (there's no separate test/optimize/deploy phase for Sky's
          // content-generation domain, unlike a full code-generating
          // builder) rather than reusing generic phase names that wouldn't
          // correspond to anything real here.
          send({ type: 'phase', phase: 'planning' })
          let parsed: z.infer<typeof responseSchema>
          try {
            const onPartial = (partial: PartialResponse) => send({ type: 'partial', object: partial })
            if (MODEL_PROVIDER === 'anthropic') {
              send({ type: 'phase', phase: 'building' })
              parsed = await generateWithClaude(userPrompt, onPartial)
            } else {
              // Luna primary, Gemini backup + reviewer — explicit user-specified
              // pipeline (2026-08-21). If Luna itself fails outright, Gemini
              // steps in as a full backup generator. If Luna succeeds, Gemini
              // gets a second look to catch real quality issues before the site
              // ships — that pass fails open (any review error just means the
              // unreviewed Luna output goes out, never blocks the response).
              try {
                send({ type: 'phase', phase: 'building' })
                parsed = await generateWithOpenAI(userPrompt, onPartial)
                try {
                  send({ type: 'phase', phase: 'reviewing' })
                  parsed = await reviewWithGemini(userPrompt, parsed)
                } catch (reviewErr) {
                  console.error('Gemini review pass failed — shipping unreviewed Luna output', reviewErr)
                }
              } catch (lunaErr) {
                console.error('Luna generation failed — falling back to Gemini', lunaErr)
                send({ type: 'phase', phase: 'building' })
                parsed = await generateWithGemini(userPrompt, onPartial)
              }
            }
          } catch (err: any) {
            if (err instanceof NoObjectGeneratedError || err instanceof ModelGenerationError) {
              send({ type: 'error', error: "The AI couldn't put together a valid response for that — try rephrasing your request." })
              return
            }
            if (
              err?.message?.includes('context_length') ||
              err?.message?.includes('maximum context length') ||
              err?.message?.includes('prompt is too long')
            ) {
              send({
                type: 'error',
                error: "Your site has grown too large for the AI to edit in one go. Try removing a few sections or pages you no longer need, then ask again.",
              })
              return
            }
            throw err
          }

          const usedSlugs = new Set<string>()
          const cleanedPages: Page[] = parsed.pages.map((p, i) => {
            const name = p.name.trim() ? p.name.trim() : i === 0 ? 'Home' : `Page ${i + 1}`
            const slug = sanitizeSlug(p.slug, name, i, usedSlugs)
            return { name, slug, sections: p.sections }
          })

          // pagelinks cards reference another page by its slug — normalize away
          // an accidental leading slash or stray whitespace so a card the model
          // meant to work actually resolves, without hard-rejecting anything (a
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
          let theme_out = parsed.theme

          // Contrast QA + auto-fix (2026-08-21) — real, live bug this was
          // built for: a generated site can pick a primary/accent pair that
          // reads fine as swatches but produces white-on-light-color text
          // once actually applied to nav/hero/CTA/headings. Bounded to 3
          // passes (never an infinite loop) — darkenUntilReadable adjusts
          // only the specific color actually failing, preserving hue rather
          // than picking an unrelated replacement. Every fix is logged.
          for (let pass = 0; pass < 3; pass++) {
            const failures = checkThemeContrast(theme_out)
            if (failures.length === 0) break
            let next = { ...theme_out }
            for (const f of failures) {
              console.warn(`[contrast QA] ${f.pair}: ${f.ratio}:1 (needs 4.5:1) — fg ${f.foreground} / bg ${f.background}`)
              if (f.foreground === theme_out.primary || f.background === theme_out.primary) {
                next.primary = darkenUntilReadable(next.primary)
              }
              if (f.foreground === theme_out.accent || f.background === theme_out.accent) {
                next.accent = darkenUntilReadable(next.accent)
              }
            }
            theme_out = next
          }

          // The explanation below is the model's own prose, written before
          // this contrast pass ran -- if the pass actually changed a color,
          // that prose is now describing a color the site no longer uses
          // (e.g. "kept your accent #D4A574" when it's really #9e6931).
          // Append a plain-language, deterministic note whenever that
          // happened, rather than silently shipping a mismatch between what
          // Sky says it did and what it actually shipped.
          const colorAdjustments: string[] = []
          if (theme_out.primary !== parsed.theme.primary) colorAdjustments.push(`primary color from ${parsed.theme.primary} to ${theme_out.primary}`)
          if (theme_out.accent !== parsed.theme.accent) colorAdjustments.push(`accent color from ${parsed.theme.accent} to ${theme_out.accent}`)
          const contrastNote = colorAdjustments.length
            ? ` One more thing: I had to darken the ${colorAdjustments.join(' and the ')} — the color you asked for didn't have enough contrast against the white text/buttons sitting on it, so I adjusted it just enough to keep that text readable.`
            : ''

          // The model can (and did, in testing) describe a change in prose
          // while returning pages/theme byte-identical to what it was given —
          // a confident-sounding lie, not an edit. Compare BEFORE image
          // resolution (Unsplash search isn't deterministic across calls, so
          // comparing after would flag a true no-op as "changed" whenever an
          // image field happens to re-resolve to a different photo). Only
          // applies to edits — a brand new site has no "before" to match
          // against.
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
            ? "I didn't actually make any changes there — it may already match what you asked for. Tell me what still feels off and I'll take another pass."
            : (typeof parsed.explanation === 'string' ? parsed.explanation : 'Done.') + contrastNote

          send({ type: 'done', explanation, theme: theme_out, pages: resolvedPages, creditsRemaining })
        } catch (err: any) {
          send({ type: 'error', error: err?.message || 'Something went wrong generating your site.' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } })
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
