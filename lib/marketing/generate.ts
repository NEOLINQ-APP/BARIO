import { getOpenAI } from '@/lib/openai'
import type { MarketingPlatform } from '@/lib/db'
import { PLATFORM_CHAR_LIMITS, PLATFORM_LABELS } from '@/lib/marketing/platforms'

const BUSINESS_BRIEF = `Bario (bario.ca) is an AI website builder and hosting service for Canadian small
businesses. Describe your business in plain language and Sky builds a live, editable website —
no code required. Every site gets a free bario.ca subdomain with SSL; Business and Agency plans can connect
a custom domain. Plans: Starter $19/mo (75 AI credits, 1 site), Business $49/mo (200 AI credits, 5 sites,
custom domain), Agency $149/mo (750 AI credits, up to 25 sites, white-label export). Canada-first hosting,
PIPEDA-aware. Tone: confident, plain-spoken, no hype/buzzwords,
speaks directly to small business owners who don't want to deal with a developer.`

const SYSTEM_PROMPT = `You write marketing posts for Bario, a Canadian AI website builder. ${BUSINESS_BRIEF}

You will be asked for one post per platform. Respect each platform's character limit and conventions:
X posts are short and punchy, no hashtag spam (0-2 max). LinkedIn posts are a bit more substantive and
professional. Facebook is conversational. Instagram captions can use a few relevant hashtags at the end.
Google Business Profile posts are short, local-focused, and action-oriented.

Never invent stats, testimonials, or customer names that weren't provided to you. Don't use emoji excessively
(0-2 max, only if it fits the platform).

Respond with a single JSON object: { "posts": [ { "platform": "...", "content": "..." }, ... ] }
CRITICAL: the "platform" value in your response must be EXACTLY the internal key given to you (e.g. "twitter"), never a display name or abbreviation (never "X", "Twitter", "LinkedIn", etc). Only include the exact platforms you were asked for below — nothing else.`

// The model doesn't always reliably echo back the exact internal key we
// gave it (real, observed failure: it returned "X" for twitter and
// "LinkedIn" for linkedin, and included platforms that weren't even
// requested) — this normalizes common display-name variants back to the
// canonical key as a defensive fallback, so a prompt-following slip doesn't
// silently drop every single draft.
const PLATFORM_ALIASES: Record<string, MarketingPlatform> = {
  x: 'twitter',
  twitter: 'twitter',
  'x (twitter)': 'twitter',
  facebook: 'facebook',
  instagram: 'instagram',
  linkedin: 'linkedin',
  google_business: 'google_business',
  'google business profile': 'google_business',
  'google business': 'google_business',
}

function normalizePlatform(raw: unknown): MarketingPlatform | null {
  if (typeof raw !== 'string') return null
  return PLATFORM_ALIASES[raw.trim().toLowerCase()] ?? null
}

export async function generateDrafts(platforms: MarketingPlatform[], topic: string): Promise<{ platform: MarketingPlatform; content: string }[]> {
  const userPrompt = `Write one marketing post for each of these platforms, about: "${topic}".

Platforms and their character limits (use these EXACT keys as the "platform" value — e.g. "${platforms[0]}", not "${PLATFORM_LABELS[platforms[0]]}"):
${platforms.map((p) => `- "${p}" (${PLATFORM_LABELS[p]}): max ${PLATFORM_CHAR_LIMITS[p]} characters`).join('\n')}

Only include these ${platforms.length} platform(s) — do not add any others.`

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
  if (!Array.isArray(parsed.posts)) throw new Error('Model did not return a posts array')

  const seen = new Set<MarketingPlatform>()
  const results: { platform: MarketingPlatform; content: string }[] = []
  for (const p of parsed.posts) {
    const platform = normalizePlatform(p?.platform)
    if (!platform || !platforms.includes(platform) || seen.has(platform)) continue
    if (typeof p?.content !== 'string' || !p.content.trim()) continue
    seen.add(platform)
    results.push({ platform, content: p.content.trim() })
  }
  return results
}
