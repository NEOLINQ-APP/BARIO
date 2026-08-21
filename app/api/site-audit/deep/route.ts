import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { db, type User, type SiteAudit } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { fetchWithTimeout, extractContentDigest, DEEP_AUDIT_CREDIT_COST } from '@/lib/siteAuditChecks'
import { getOpenAI } from '@/lib/openai'
import { errorResponse } from '@/lib/errors'

export const maxDuration = 60

const issueSchema = z.object({
  severity: z.enum(['critical', 'warning', 'info']),
  category: z.enum(['seo', 'performance', 'security', 'accessibility', 'content']),
  title: z.string(),
  finding: z.string(),
  why: z.string(),
  fix: z.string(),
})
const BARIO_SERVICES = [
  'ai_website_builder',
  'wordpress_hosting',
  'vps_hosting',
  'bario_one_crm',
  'domain_registration',
  'email_hosting',
  'voice_ai_receptionist',
] as const
const recommendedServiceSchema = z.object({ service: z.enum(BARIO_SERVICES), reason: z.string() })
const reportSchema = z.object({
  summary: z.string(),
  score: z.number().int().min(0).max(100),
  issues: z.array(issueSchema),
  quickWins: z.array(z.string()),
  // AISHA extension (multi-agent CRM Phase 4): separate from `score` (site
  // health) — this is "how likely is this specific business to actually
  // buy something from Bario," so a technically-fine site with an
  // expensive/unreliable host still scores high here even if `score` is
  // high too. Surfaced in /admin/site-audit-leads so outreach can be
  // prioritized by real sales opportunity, not just by how broken a site is.
  opportunityScore: z.number().int().min(0).max(100),
  recommendedServices: z.array(recommendedServiceSchema).max(3),
})
export type DeepAuditReport = z.infer<typeof reportSchema>

const SYSTEM_PROMPT = `You are Bario's site-audit analyst. You are given REAL, server-crawled data from a specific website — its actual title tag, meta description, heading structure, visible text content, and rule-based technical findings (WordPress detection, alt-text coverage, HTTPS, sitemap/robots presence, etc). This is data a generic AI chatbot cannot obtain on its own, since it can't crawl and parse a live site itself — make the report reflect genuine analysis of what was actually found, not generic advice that could apply to any site.

Write specific, concrete, prioritized findings referencing the ACTUAL content you were given (quote the real title/headline text, name the real missing elements) — never generic filler advice. If ruleBasedFindings.seo.isBarioHosted is true, do not treat a missing sitemap.xml/robots.txt as a mistake the site owner made — that is a known, planned platform gap on Bario's own side, not their fault; still note it factually but frame it accordingly.

You are ALSO assessing this as a sales opportunity for Bario.ca (an all-in-one hosting + AI website builder + CRM platform for Canadian businesses) — separately from the site's technical health score above. A technically fine site on an expensive or unreliable host is still a real opportunity; a broken site with an owner who's clearly not going to spend money is not. Base opportunityScore and recommendedServices only on real signals in the data you were given (isBarioHosted, isWordPress, missing sitemap/HTTPS, thin/stale content, no visible CRM or booking system referenced in the copy, etc.) — never guess at things you can't see. If isBarioHosted is true, do not recommend hosting/domain/builder services (already a Bario customer for those) — focus on gaps they might still have (CRM, email hosting, voice AI receptionist).

Respond with ONLY a single JSON object matching this exact shape, no other text:
{
  "summary": "2-3 sentence plain-language overview of this specific site's biggest opportunities",
  "score": <integer 0-100, overall site health/SEO-readiness>,
  "issues": [
    { "severity": "critical" | "warning" | "info", "category": "seo" | "performance" | "security" | "accessibility" | "content",
      "title": "short label", "finding": "what's actually wrong, referencing real content", "why": "why it matters",
      "fix": "specific, actionable rewrite/fix — e.g. an actual suggested title tag or meta description text" }
  ],
  "quickWins": ["3-5 short highest-impact-lowest-effort items"],
  "opportunityScore": <integer 0-100, likelihood this specific business would benefit from and buy a Bario service>,
  "recommendedServices": [
    { "service": "ai_website_builder" | "wordpress_hosting" | "vps_hosting" | "bario_one_crm" | "domain_registration" | "email_hosting" | "voice_ai_receptionist",
      "reason": "one sentence, specific to this site, why this service fits" }
  ]
}
Order "issues" most severe first, "recommendedServices" most relevant first (at most 3). Base every issue and recommendation strictly on the provided data — never invent findings not supported by it.`

async function callDeepAuditModel(findings: unknown, digest: unknown): Promise<DeepAuditReport> {
  const userContent = JSON.stringify({ ruleBasedFindings: findings, content: digest })
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]

  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-5.6-luna',
      response_format: { type: 'json_object' },
      messages,
    })
    const raw = completion.choices[0]?.message?.content ?? '{}'
    let parsed: unknown = null
    try {
      parsed = JSON.parse(raw)
    } catch {}
    const validated = parsed ? reportSchema.safeParse(parsed) : null
    if (validated?.success) return validated.data

    if (attempt === 0) {
      // One repair attempt, same idea as builder/generate/route.ts's
      // validate-then-retry pattern — echo back what came out and exactly
      // what was wrong with it.
      const problem = validated ? validated.error.message : 'The response was not valid JSON.'
      messages.push(
        { role: 'assistant', content: raw },
        { role: 'user', content: `That response was invalid: ${problem}. Respond again with ONLY the corrected JSON object, no other text.` }
      )
      continue
    }
    throw new Error('Could not generate a valid report after a retry')
  }
  throw new Error('Could not generate a valid report')
}

// The paid deep-dive — takes a prior free-tier audit (guarantees the LLM
// analyzes exactly what the user already saw, no re-crawl mismatch),
// charges credits ONLY after a successful response (this route is
// synchronous, not queued, so there's no need for Studio's
// charge-then-refund-on-failure dance — just don't charge until success
// is confirmed).
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })
    if (!hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the site audit tool' }, { status: 403 })
    }

    const { auditId } = await req.json().catch(() => ({}))
    if (typeof auditId !== 'string' || !auditId) {
      return NextResponse.json({ error: 'auditId is required' }, { status: 400 })
    }

    const auditRows = (await sql`SELECT * FROM site_audits WHERE id = ${auditId} AND user_id = ${user.id}`) as unknown as SiteAudit[]
    const audit = auditRows[0]
    if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 })

    if (audit.ai_report_json) {
      // Already unlocked — return the cached report instead of charging again.
      return NextResponse.json({ ok: true, report: JSON.parse(audit.ai_report_json), creditsRemaining: user.is_admin ? -1 : user.credits_remaining })
    }

    if (!user.is_admin) {
      const creditsAvailable = await ensureCreditsRefreshed(sql, user)
      if (creditsAvailable < DEEP_AUDIT_CREDIT_COST) {
        const resetDate = user.credits_reset_at ? new Date(user.credits_reset_at).toLocaleDateString() : 'next billing cycle'
        return NextResponse.json(
          { error: `This report costs ${DEEP_AUDIT_CREDIT_COST} credits — you have ${creditsAvailable}. They refresh on ${resetDate}, or upgrade your plan for more.` },
          { status: 403 }
        )
      }
    }

    const findings = JSON.parse(audit.findings_json)

    let homeHtml: string
    try {
      const res = await fetchWithTimeout(audit.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      homeHtml = await res.text()
    } catch (err: any) {
      await sql`UPDATE site_audits SET status = 'failed', error = ${`Could not re-fetch the site: ${err.message}`} WHERE id = ${auditId}`
      return NextResponse.json({ error: "Couldn't re-fetch that site — it may be temporarily unreachable. Try again shortly." }, { status: 502 })
    }
    const digest = extractContentDigest(homeHtml)

    let report: DeepAuditReport
    try {
      report = await callDeepAuditModel(findings, digest)
    } catch (err: any) {
      await sql`UPDATE site_audits SET status = 'failed', error = ${err.message ?? 'AI report generation failed'} WHERE id = ${auditId}`
      return NextResponse.json({ error: "Couldn't generate the report right now — no credits were charged. Please try again." }, { status: 502 })
    }

    let creditsRemaining = -1
    if (!user.is_admin) {
      const updated = (await sql`
        UPDATE users SET credits_remaining = credits_remaining - ${DEEP_AUDIT_CREDIT_COST} WHERE id = ${user.id} RETURNING credits_remaining
      `) as unknown as { credits_remaining: number }[]
      creditsRemaining = updated[0]?.credits_remaining ?? 0
    }

    await sql`
      UPDATE site_audits
      SET ai_report_json = ${JSON.stringify(report)}, credits_charged = ${user.is_admin ? 0 : DEEP_AUDIT_CREDIT_COST}, status = 'complete', error = NULL
      WHERE id = ${auditId}
    `

    return NextResponse.json({ ok: true, report, creditsRemaining })
  } catch (err: any) {
    return errorResponse(err)
  }
}
