import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOpenAI } from '@/lib/openai'
import { rateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { BARIO_ONE_CALL_LOG_ORG_IDS } from '@/lib/barioOneCrmCallLog'
import { errorResponse } from '@/lib/errors'
import type { BoServiceCatalogItem } from '@/lib/db'

// Hydro — HydroBlasters.ca's public, unauthenticated pricing/service
// advisor, same shape as Aria's pre-login mode (app/api/assistant/chat)
// but scoped to one client's own catalog instead of Bario's own plans.
// The entire pricing knowledge lives in bo_service_catalog (seeded from
// lib/hydroblastersCatalog.ts, editable via the admin catalog routes) and
// gets re-read into the system prompt on every request -- a price changed
// in the DB is what Hydro says on the very next message, no redeploy, no
// separate copy of the numbers to keep in sync.
const ORG_ID = BARIO_ONE_CALL_LOG_ORG_IDS.hydroblasters

// CORS-open — called cross-origin from hydroblasters.bario.ca (and later
// hydroblasters.ca) to www.bario.ca, same as every other /api/public/* route.
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function money(cents: number | null): string {
  if (cents == null) return 'N/A'
  return `$${(cents / 100).toFixed(2)}`
}

function formatCatalogForPrompt(items: BoServiceCatalogItem[]): string {
  const byCategory = new Map<string, BoServiceCatalogItem[]>()
  for (const item of items) {
    const list = byCategory.get(item.category) ?? []
    list.push(item)
    byCategory.set(item.category, list)
  }

  const lines: string[] = []
  for (const [category, catItems] of Array.from(byCategory.entries())) {
    lines.push(`\n### ${category}`)
    for (const it of catItems) {
      const label = it.subcategory ? `${it.name} — ${it.subcategory}` : it.name
      let priceStr: string
      if (it.price_type === 'custom_quote') priceStr = 'CUSTOM QUOTE (no fixed price — never state a number)'
      else if (it.price_type === 'starting') priceStr = `starts at ${money(it.price_cents)} + GST`
      else priceStr = `${money(it.price_cents)} + GST (fixed)`

      const duration = it.estimated_duration_hours != null ? `, est. ${it.estimated_duration_hours}h` : ''
      const addonTag = it.is_addon ? ' [ADD-ON]' : ''
      lines.push(`- ${label}${addonTag}: ${priceStr}${duration} (slug: ${it.slug})`)

      const inclusions = JSON.parse(it.inclusions_json || '[]') as string[]
      const exclusions = JSON.parse(it.exclusions_json || '[]') as string[]
      if (inclusions.length) lines.push(`  Includes: ${inclusions.join(', ')}`)
      if (exclusions.length) lines.push(`  Not included unless purchased separately: ${exclusions.join(', ')}`)
      if (it.description) lines.push(`  Note: ${it.description}`)
    }
  }
  return lines.join('\n')
}

function buildSystemPrompt(catalogText: string): string {
  return `You are Hydro, the customer-facing AI service advisor for HydroBlasters.ca (mobile pressure washing, automotive/fleet/boat/RV/heavy-equipment detailing, and residential/commercial exterior cleaning across Canada).

=== ABSOLUTE PRICING RULES — VIOLATING THESE IS A CRITICAL FAILURE ===
1. The catalog below is the ONLY source of prices, inclusions, exclusions, and durations. NEVER invent, estimate, or guess a number, inclusion, or exclusion that isn't listed.
2. A price marked "(fixed)" is the real price under normal condition — state it exactly, e.g. "$379.00 + GST".
3. A price marked "starts at" is a FLOOR, not the final price. Always say "starts at $X + GST" and mention the final price depends on condition/scope. Never state it as if it were the final number.
4. "CUSTOM QUOTE" items have NO fixed number. Never state a dollar figure for these — explain that the scope varies too much to price without details/photos, and offer to help them submit those so the team can quote it.
5. All prices are pre-GST; GST is calculated at checkout, not by you. Never quote a GST-inclusive total.
6. A package's internal travel/setup cost is already folded into its price — NEVER mention or add any separate setup/travel charge to a customer.
7. When a customer asks about a package plus an add-on, add the two listed prices together and show the pre-GST subtotal (e.g. "Signature Detail ($379) + Engine Bay Detail ($100) = $479 + GST"). Never silently add anything not explicitly requested.

=== BOOKING & SCHEDULING ===
- You cannot book, charge, invoice, or confirm an appointment yourself — you have no live calendar or payment access. Never claim you've booked something, checked real-time availability, or charged a card. Direct the customer to the "Book Online" wizard on the site to actually submit and confirm a request.
- HydroBlasters is a new operation still building capacity: most jobs need at least 72 hours between bookings so the crew has time to prep between sites. Short jobs (4 hours or less) can sometimes be doubled up two-per-day. If asked about turnaround/availability, mention this honestly rather than promising a specific slot — the booking wizard enforces the real rule.
- Photos are optional for booking, never mandatory, but recommended for anything with heavy dirt, stains, damage, oxidation, pet hair, grease, oil, or unusual contamination — they help the team prep the right chemicals/equipment.
- Every job gets a pre-service inspection/photos before work starts — this documents pre-existing condition/damage, it isn't optional on HydroBlasters' side even though customer photos are.
- On-site requirement: every mobile job needs customer-provided access to an outdoor water hose spigot and a standard 120V electrical outlet.

=== TONE ===
Professional, warm, confident, concise — a knowledgeable service advisor, not a generic chatbot. Answer price questions directly and immediately (don't interrogate with five questions first); ask only what's relevant to the specific category being discussed. Cross-sell add-ons naturally when relevant, never pushy. If information isn't in the catalog below, say so honestly rather than guessing — offer to have the team confirm it.

=== CURRENT SERVICE CATALOG (source of truth — read fresh every message) ===
${catalogText}
`
}

const MAX_MESSAGE_LENGTH = 1000
const MAX_HISTORY = 12

export async function POST(req: Request) {
  try {
    if (!ORG_ID) return NextResponse.json({ error: 'Hydro is not configured' }, { status: 500, headers: CORS_HEADERS })

    const sql = await db()
    const ok = await rateLimit(sql, `hydro-chat:ip:${clientIp(req)}`, 30, 60 * 60)
    if (!ok) {
      const res = rateLimitResponse()
      Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v))
      return res
    }

    const body = await req.json().catch(() => null)
    const incoming = Array.isArray(body?.messages) ? body.messages : null
    if (!incoming || incoming.length === 0) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400, headers: CORS_HEADERS })
    }
    const cleaned = incoming
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim())
      .slice(-MAX_HISTORY)
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, MAX_MESSAGE_LENGTH) }))
    if (cleaned.length === 0) return NextResponse.json({ error: 'No message provided' }, { status: 400, headers: CORS_HEADERS })

    const catalogRows = (await sql`
      SELECT * FROM bo_service_catalog WHERE organization_id = ${ORG_ID} AND active = true ORDER BY sort_order ASC
    `) as unknown as BoServiceCatalogItem[]

    const systemPrompt = buildSystemPrompt(formatCatalogForPrompt(catalogRows))

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      temperature: 0.3,
      messages: [{ role: 'system', content: systemPrompt }, ...cleaned],
    })

    const reply = completion.choices[0]?.message?.content?.trim() || "Sorry, I didn't quite catch that — could you rephrase?"
    return NextResponse.json({ reply }, { headers: CORS_HEADERS })
  } catch (err) {
    const res = errorResponse(err)
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v))
    return res
  }
}
