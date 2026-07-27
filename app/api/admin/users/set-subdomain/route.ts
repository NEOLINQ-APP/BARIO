import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Admin equivalent of the subdomain half of /api/sites/publish — lets the
// admin assign a *.bario.ca subdomain on a managed account's site without
// needing a session. Useful as an immediate preview URL for a site whose
// custom domain is still pending DNS/verification (subdomain lookup has no
// domain_status gate, unlike custom_domain).
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'hub', 'mail'])

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { siteId, subdomain } = await req.json()
    if (typeof siteId !== 'string' || !siteId.trim()) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 })
    }
    const clean = String(subdomain ?? '').trim().toLowerCase()
    if (!SUBDOMAIN_RE.test(clean)) {
      return NextResponse.json({ error: 'Subdomain must be lowercase letters, numbers, and hyphens only' }, { status: 400 })
    }
    if (RESERVED_SUBDOMAINS.has(clean)) {
      return NextResponse.json({ error: 'That subdomain is reserved' }, { status: 409 })
    }

    const taken = (await sql`SELECT id FROM sites WHERE subdomain = ${clean} AND id != ${siteId}`) as unknown as { id: string }[]
    if (taken[0]) {
      return NextResponse.json({ error: 'That subdomain is already taken' }, { status: 409 })
    }

    await sql`UPDATE sites SET subdomain = ${clean} WHERE id = ${siteId}`

    await logAdminAction(sql, { action: 'set-subdomain', params: { siteId, subdomain: clean }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, siteId, subdomain: clean, url: `https://${clean}.bario.ca` })
  } catch (err: any) {
    return errorResponse(err)
  }
}
