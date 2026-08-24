import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'

// Real-world trigger: blessandseemusic.com's DNS silently drifted away from
// Bario back to its old host at some undocumented point, and nobody noticed
// until the customer reported the site broken -- an unknown-length silent
// outage. This checks EVERY published site on the platform (both a
// connected custom domain and a plain *.bario.ca subdomain -- either can
// break independently, not just custom domains) on a schedule so a
// repointed DNS record, an expired domain, or the origin doing something
// wrong (e.g. redirecting away, matching what actually happened here)
// surfaces within the cron interval instead of only when a customer
// happens to visit and complain. Test/throwaway accounts are excluded --
// same exclusion patterns used everywhere else in this project -- so a
// stale dev signup doesn't generate noise or wasted checks.
export const maxDuration = 60

const TEST_EMAIL_PATTERNS = [/@bario-internal-test\.com$/i, /@example\.com$/i, /@mailtest\.bario\.ca$/i, /^deleted-.*@deleted\.bario\.ca$/i]

type SiteRow = {
  id: string
  name: string
  subdomain: string | null
  custom_domain: string | null
  domain_status: string | null
  custom_domain_health: string | null
  custom_domain_health_alerted_at: string | null
  owner_email: string
}

const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'surewinmendoza.ca@gmail.com'
const REALERT_AFTER_MS = 24 * 60 * 60 * 1000 // don't re-alert for an already-known-bad domain more than once/day

async function checkDomain(domain: string): Promise<{ status: 'ok' | 'unreachable' | 'redirected_away' | 'server_error'; detail: string }> {
  try {
    const res = await fetch(`https://${domain}/`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Bario-DomainHealthCheck/1.0' },
    })
    const finalHost = new URL(res.url).hostname.replace(/^www\./, '')
    const expectedHost = domain.replace(/^www\./, '')
    if (finalHost !== expectedHost) {
      return { status: 'redirected_away', detail: `Ended up at ${finalHost} instead of ${domain}` }
    }
    if (res.status >= 500) {
      return { status: 'server_error', detail: `HTTP ${res.status}` }
    }
    return { status: 'ok', detail: `HTTP ${res.status}` }
  } catch (err: any) {
    return { status: 'unreachable', detail: err?.message || 'fetch failed' }
  }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()
  const allSites = (await sql`
    SELECT s.id, s.name, s.subdomain, s.custom_domain, s.domain_status, s.custom_domain_health, s.custom_domain_health_alerted_at, u.email AS owner_email
    FROM sites s JOIN users u ON u.id = s.user_id
    WHERE s.is_published = true AND (s.subdomain IS NOT NULL OR s.custom_domain IS NOT NULL)
  `) as unknown as SiteRow[]

  const sites = allSites.filter((s) => !TEST_EMAIL_PATTERNS.some((re) => re.test(s.owner_email)))

  const results: { domain: string; status: string; detail: string; alerted: boolean }[] = []

  for (const site of sites) {
    // Prefer the connected custom domain (the "real" public address once
    // verified) but fall back to the bario.ca subdomain when that's all a
    // site has -- both are independently reachable per the site router, so
    // whichever one is actually the live public address gets checked.
    const domain =
      site.custom_domain && site.domain_status === 'verified' ? site.custom_domain : site.subdomain ? `${site.subdomain}.bario.ca` : null
    if (!domain) continue

    const { status, detail } = await checkDomain(domain)
    const wasOk = site.custom_domain_health === 'ok' || site.custom_domain_health === null
    const isNowBad = status !== 'ok'
    const lastAlertAgeMs = site.custom_domain_health_alerted_at ? Date.now() - new Date(site.custom_domain_health_alerted_at).getTime() : Infinity
    const shouldAlert = isNowBad && (wasOk || lastAlertAgeMs > REALERT_AFTER_MS)

    await sql`
      UPDATE sites SET custom_domain_health = ${status}, custom_domain_health_checked_at = now()
      WHERE id = ${site.id}
    `

    if (shouldAlert) {
      await sql`UPDATE sites SET custom_domain_health_alerted_at = now() WHERE id = ${site.id}`
      const subject = `⚠ ${domain} is ${status === 'redirected_away' ? 'redirecting away from Bario' : status} `
      const html = `
        <p><strong>${domain}</strong> (site "${site.name}") failed its health check.</p>
        <p>Status: <strong>${status}</strong><br/>Detail: ${detail}</p>
        <p>This usually means the domain's DNS no longer points at Bario, or the destination it now points to is misconfigured. Check the domain's DNS records and Bario's <code>sites.domain_status</code>.</p>
      `
      await Promise.allSettled([
        sendEmail(ADMIN_NOTIFY_EMAIL, subject, html),
        site.owner_email !== ADMIN_NOTIFY_EMAIL ? sendEmail(site.owner_email, subject, html) : Promise.resolve(),
      ])
    }

    results.push({ domain, status, detail, alerted: shouldAlert })
  }

  return NextResponse.json({ ok: true, checked: results.length, skippedTestAccounts: allSites.length - sites.length, results })
}
