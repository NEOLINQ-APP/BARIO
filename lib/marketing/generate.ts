import { getOpenAI } from '@/lib/openai'
import type { MarketingPlatform } from '@/lib/db'
import { PLATFORM_CHAR_LIMITS, PLATFORM_LABELS } from '@/lib/marketing/platforms'

const BUSINESS_BRIEF = `Bario (bario.ca) is an AI website builder and hosting service for Canadian small
businesses. Describe your business in plain language and the AI (Zeus) builds a live, editable website —
no code required. Every site gets a free bario.ca subdomain with SSL; Business and Agency plans can connect
a custom domain. Plans: Starter $19/mo (75 AI credits, 1 site), Business $49/mo (200 AI credits, 5 sites,
custom domain), Agency $149/mo (750 AI credits, unlimited sites, white-label export). Based in Edmonton, AB
and Vancouver, BC. Canada-first hosting, PIPEDA-aware. Tone: confident, plain-spoken, no hype/buzzwords,
speaks directly to small business owners who don't want to deal with a developer.`

const SYSTEM_PROMPT = `You write marketing posts for Bario, a Canadian AI website builder. ${BUSINESS_BRIEF}

You will be asked for one post per platform. Respect each platform's character limit and conventions:
X posts are short and punchy, no hashtag spam (0-2 max). LinkedIn posts are a bit more substantive and
professional. Facebook is conversational. Instagram captions can use a few relevant hashtags at the end.
Google Business Profile posts are short, local-focused, and action-oriented.

Never invent stats, testimonials, or customer names that weren't provided to you. Don't use emoji excessively
(0-2 max, only if it fits the platform).

Respond with a single JSON object: { "posts": [ { "platform": "...", "content": "..." }, ... ] }`

export async function generateDrafts(platforms: MarketingPlatform[], topic: string): Promise<{ platform: MarketingPlatform; content: string }[]> {
  const userPrompt = `Write one marketing post for each of these platforms, about: "${topic}".

Platforms and their character limits:
${platforms.map((p) => `- ${p} (${PLATFORM_LABELS[p]}): max ${PLATFORM_CHAR_LIMITS[p]} characters`).join('\n')}`

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

  return parsed.posts
    .filter((p: any) => platforms.includes(p?.platform) && typeof p?.content === 'string' && p.content.trim())
    .map((p: any) => ({ platform: p.platform as MarketingPlatform, content: p.content.trim() }))
}
