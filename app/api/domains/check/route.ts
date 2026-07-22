import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rateLimit'
import { checkDomainAvailability } from '@/lib/rdap'
import { errorResponse } from '@/lib/errors'

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

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

    const availability = await checkDomainAvailability(domain)
    return NextResponse.json({ domain, availability })
  } catch (err: any) {
    return errorResponse(err)
  }
}
