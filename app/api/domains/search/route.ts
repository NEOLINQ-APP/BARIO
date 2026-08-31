import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rateLimit'
import { checkDomains, getTldPricing } from '@/lib/registrar'
import { errorResponse } from '@/lib/errors'

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

// Real registrar-backed domain search (via lib/registrar.ts's ResellerClub
// proxy) — distinct from /api/domains/check, which is the public homepage
// teaser widget backed by RDAP (no pricing, no purchase path). This one
// actually reflects what a customer could buy, but still just returns
// availability + pricing; the actual purchase is a separate endpoint since
// it needs real registrant contact info.
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const allowed = await rateLimit(sql, `domain-search:${clientIp(req)}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const body = await req.json().catch(() => ({}))
    const domains = Array.isArray(body?.domains) ? body.domains.map((d: unknown) => String(d).trim().toLowerCase()) : []
    if (domains.length === 0 || domains.length > 20) {
      return NextResponse.json({ error: 'Provide 1-20 domain names to check' }, { status: 400 })
    }
    for (const d of domains) {
      if (!DOMAIN_RE.test(d)) return NextResponse.json({ error: `"${d}" is not a valid domain name` }, { status: 400 })
    }

    const results = await checkDomains(domains)

    // Non-premium domains don't carry pricing in the check response itself
    // (only premium/aftermarket names do) — fetch the base TLD's price
    // separately, once per distinct TLD across the batch.
    const tlds = Array.from(new Set(results.map((r) => r.domain.split('.').slice(1).join('.'))))
    const pricingByTld: Record<string, { registrationPrice: number; additionalCost: number; currency: string } | null> = {}
    await Promise.all(
      tlds.map(async (tld) => {
        try {
          const p = await getTldPricing(tld)
          pricingByTld[tld] = { registrationPrice: p.registrationPrice, additionalCost: p.additionalCost, currency: p.currency }
        } catch {
          pricingByTld[tld] = null
        }
      })
    )

    const enriched = results.map((r) => {
      const tld = r.domain.split('.').slice(1).join('.')
      return { ...r, pricing: r.isPremium ? null : pricingByTld[tld] }
    })

    return NextResponse.json({ ok: true, results: enriched })
  } catch (err: any) {
    return errorResponse(err)
  }
}
