import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAdminAction } from '@/lib/adminActions'

// Scraped leads (business directories) only ever had name/phone/address/
// website — no email. This visits each contact's own company website and
// looks for a published contact email (footer, contact page, mailto link),
// so the human-reviews-then-sends outreach flow (app/api/admin/crm-leadgen)
// has a real address to send to. Not every business publishes one — those
// are recorded as found=false and skipped on future runs, not retried
// forever.
export const maxDuration = 120
const MAX_PER_RUN = 15

type CrmConfig = {
  key: string
  graphqlUrl: string
  metadataUrl: string
  apiKeyEnvVar: string
}

const CRMS: CrmConfig[] = [
  { key: 'afc', graphqlUrl: 'https://afc.crm.bario.ca/graphql', metadataUrl: 'https://afc.crm.bario.ca/metadata', apiKeyEnvVar: 'AFC_CRM_API_KEY' },
  { key: 'sunbuilt', graphqlUrl: 'https://sunbuilt.crm.bario.ca/graphql', metadataUrl: 'https://sunbuilt.crm.bario.ca/metadata', apiKeyEnvVar: 'SUNBUILT_CRM_API_KEY' },
]

async function crmGraphQL(crm: CrmConfig, query: string, variables: Record<string, unknown>) {
  const apiKey = process.env[crm.apiKeyEnvVar]
  if (!apiKey) throw new Error(`${crm.apiKeyEnvVar} is not set`)
  const res = await fetch(crm.graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`${crm.key} GraphQL error: ${JSON.stringify(json.errors)}`)
  return json.data
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
// Generic platform addresses that show up in website chrome (share widgets,
// privacy-policy boilerplate, etc.) but aren't a real contact address for
// this specific business — skip these rather than mailing a stranger's inbox.
const JUNK_DOMAINS = ['sentry.io', 'wixpress.com', 'example.com', 'godaddy.com', 'domain.com', 'yourdomain.com']

function extractContactEmail(html: string, websiteDomain: string): string | null {
  const matches = html.match(EMAIL_RE)
  if (!matches) return null
  const candidates = matches
    .map((m) => m.toLowerCase())
    .filter((m) => !JUNK_DOMAINS.some((j) => m.endsWith('@' + j) || m.includes('.' + j)))
    .filter((m) => !m.match(/\.(png|jpg|jpeg|gif|svg|webp)$/))
  if (candidates.length === 0) return null
  // Prefer an address on the business's own domain over a third-party one
  // (e.g. a Gmail address in a testimonial) — same-domain is a much stronger
  // signal this is the business's real contact address.
  const sameDomain = candidates.find((m) => websiteDomain && m.endsWith('@' + websiteDomain.replace(/^www\./, '')))
  return sameDomain || candidates[0]
}

async function tryFetchEmailFromWebsite(websiteUrl: string): Promise<string | null> {
  let domain = ''
  try {
    domain = new URL(websiteUrl).hostname
  } catch {
    return null
  }
  const pagesToTry = ['', '/contact', '/contact-us', '/about']
  for (const path of pagesToTry) {
    try {
      const url = new URL(path, websiteUrl).toString()
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BarioLeadEnrich/1.0)' } })
      if (!res.ok) continue
      const html = await res.text()
      const email = extractContactEmail(html, domain)
      if (email) return email
    } catch {
      // This page/path failed (timeout, DNS, 404) — try the next candidate
      // rather than giving up on the whole business after one bad path.
      continue
    }
  }
  return null
}

async function processCrm(crm: CrmConfig, sql: any) {
  const result = { crm: crm.key, found: [] as string[], notFound: [] as string[], errors: [] as string[] }

  const data = await crmGraphQL(
    crm,
    `query { people(first: 500) { edges { node { id emails { primaryEmail } company { name domainName { primaryLinkUrl } } } } } }`,
    {}
  )
  const people = (data?.people?.edges ?? []).map((e: any) => e.node)

  let processed = 0
  for (const person of people) {
    if (processed >= MAX_PER_RUN) break
    if (person.emails?.primaryEmail) continue // already has a real email
    const website = person.company?.domainName?.primaryLinkUrl
    if (!website) continue

    const already = await sql`SELECT found FROM crm_email_enrichment WHERE crm_key = ${crm.key} AND person_id = ${person.id}`
    if (already.length > 0) continue // already checked (found or not) — don't re-fetch every run

    processed++
    try {
      const email = await tryFetchEmailFromWebsite(website)
      if (email) {
        await crmGraphQL(
          crm,
          `mutation($id: ID!, $data: PersonUpdateInput!){ updatePerson(id: $id, data: $data) { id } }`,
          { id: person.id, data: { emails: { primaryEmail: email, additionalEmails: [] } } }
        )
        result.found.push(`${person.id}:${email}`)
      } else {
        result.notFound.push(person.id)
      }
      await sql`
        INSERT INTO crm_email_enrichment (crm_key, person_id, found) VALUES (${crm.key}, ${person.id}, ${!!email})
        ON CONFLICT (crm_key, person_id) DO NOTHING
      `
    } catch (err: any) {
      result.errors.push(`${person.id}: ${err.message}`)
    }
  }

  return result
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()
  const results = []
  for (const crm of CRMS) {
    try {
      results.push(await processCrm(crm, sql))
    } catch (err: any) {
      results.push({ crm: crm.key, found: [], notFound: [], errors: [err.message] })
    }
  }

  const totalFound = results.reduce((n, r) => n + r.found.length, 0)
  const totalErrors = results.reduce((n, r) => n + r.errors.length, 0)
  if (totalFound > 0 || totalErrors > 0) {
    await logAdminAction(sql, {
      action: 'crm-email-enrich-run',
      params: { results },
      result: totalErrors > 0 && totalFound === 0 ? 'error' : 'ok',
      triggeredBy: 'ai_autonomous',
    })
  }

  return NextResponse.json({ ok: true, results })
}
