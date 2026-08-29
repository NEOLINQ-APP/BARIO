import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// One-off diagnostic (2026-08-21): bario.ca's DNS is on Cloudflare's own
// nameservers, and a persistent 502 hitting /api/internal/victoria/*
// routes (headers show zero x-vercel-* headers — meaning Cloudflare itself
// is returning the error without ever reaching Vercel) points at a
// Cloudflare-side WAF/rate-limit rule, not application code. The real
// CLOUDFLARE_API_TOKEN only exists server-side on Vercel (Sensitive var,
// can't be read locally) — this runs the zone lookup + recent firewall
// events check using that real token.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) return NextResponse.json({ error: 'CLOUDFLARE_API_TOKEN not configured' }, { status: 500 })

  try {
    const zoneRes = await fetch('https://api.cloudflare.com/client/v4/zones?name=bario.ca', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const zoneData = await zoneRes.json()
    const zone = zoneData.result?.[0]
    if (!zone) return NextResponse.json({ ok: false, zoneLookup: zoneData })

    const eventsRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zone.id}/security/events?since=${new Date(Date.now() - 3600_000).toISOString()}&limit=25`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const eventsData = await eventsRes.json()

    const rulesRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/firewall/rules`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const rulesData = await rulesRes.json()

    const rateLimitsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/rate_limits`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const rateLimitsData = await rateLimitsRes.json()

    const rulesetsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/rulesets`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const rulesetsData = await rulesetsRes.json()

    // Fetch full detail (including individual rule actions) for every
    // ruleset in the custom-firewall and rate-limit phases specifically —
    // these are what actually block/challenge traffic on modern Cloudflare.
    let rulesetDetails: any[] = []
    if (rulesetsData.success) {
      const relevant = (rulesetsData.result as any[]).filter((r) =>
        ['http_request_firewall_custom', 'http_ratelimit', 'http_request_firewall_managed', 'http_request_sbfm', 'ddos_l7'].includes(r.phase)
      )
      rulesetDetails = await Promise.all(
        relevant.map(async (r) => {
          const detailRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/rulesets/${r.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const detailData = await detailRes.json()
          return { phase: r.phase, name: r.name, rules: detailData.result?.rules ?? detailData.errors }
        })
      )
    }

    return NextResponse.json({
      ok: true,
      zoneId: zone.id,
      zoneStatus: zone.status,
      recentSecurityEvents: eventsData.success ? eventsData.result : eventsData.errors,
      firewallRules: rulesData.success ? rulesData.result : rulesData.errors,
      rateLimits: rateLimitsData.success ? rateLimitsData.result : rateLimitsData.errors,
      rulesetList: rulesetsData.success ? rulesetsData.result.map((r: any) => ({ id: r.id, name: r.name, phase: r.phase })) : rulesetsData.errors,
      rulesetDetails,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
