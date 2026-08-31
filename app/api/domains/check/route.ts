import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rateLimit'
import { checkDomains } from '@/lib/registrar'
import { checkDomainAvailability } from '@/lib/rdap'
import { errorResponse } from '@/lib/errors'

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

// 2026-08-29: switched from a direct rdap.org fetch to the real
// registrar-backed check (same VPS-proxied ResellerClub path /api/domains/
// search already uses) -- rdap.org was returning a 403 Cloudflare
// bot-protection page to every request from Vercel's serverless IPs,
// making every domain/every TLD report 'unknown' regardless of real
// availability. This is also real registrar data (broad TLD coverage:
// .com/.ca/.co/.org/.ai/.tech/.net/.io and more), not just RDAP's
// inconsistent per-registry support, and requires no session (checkDomains
// itself isn't auth-gated -- only the /api/domains/search route wrapping
// it for the authenticated search UI is). Falls back to the old RDAP path
// only if the registrar proxy itself throws, so a single-provider outage
// doesn't take down the whole widget.
export async function GET(req: Request) {
  try {
    const sql = await db()
    const allowed = await rateLimit(sql, `domain-check:${clientIp(req)}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const { searchParams } = new URL(req.url)
    const domain = String(searchParams.get('domain') ?? '').trim().toLowerCase()
    if (!DOMAIN_RE.test(domain)) {
      return NextResponse.json({ error: 'Enter a valid domain, e.g. myrestaurant.com' }, { status: 400 })
    }

    try {
      const [result] = await checkDomains([domain])
      const availability = result ? (result.available ? 'available' : 'taken') : 'unknown'
      return NextResponse.json({ domain, availability })
    } catch (registrarErr) {
      console.error('Registrar-backed domain check failed, falling back to RDAP', registrarErr)
      const availability = await checkDomainAvailability(domain)
      return NextResponse.json({ domain, availability })
    }
  } catch (err: any) {
    return errorResponse(err)
  }
}
