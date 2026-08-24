import { randomUUID } from 'node:crypto'
import { BARIO_ONE_CALL_LOG_ORG_IDS } from '@/lib/barioOneCrmCallLog'

// Sends the already-drafted "BARIO Draft: Outreach to X" bo_notes content
// as a real intro email, for businesses whose CRM outreach pipeline is
// otherwise disabled (see CLAUDE.md's "Known-disabled feature: CRM
// Outreach"). Deliberately plain/personal-looking rather than a designed
// HTML template -- this is cold B2B outreach, not a consumer marketing
// blast, and heavily-styled HTML tends to read as spam and hurt
// deliverability for exactly this kind of email.
//
// Hard idempotency via bo_outreach_sends (unique on org+customer) is the
// real "never duplicate/spam a lead" guarantee -- not just a best-effort
// in-memory check.
const BUSINESS_CONFIG: Record<string, { name: string; fromEmail: string; signature: string }> = {
  afc: { name: 'AFC Logistics', fromEmail: 'hello@afclogistics.ca', signature: 'The AFC Logistics Team' },
  sunbuilt: { name: 'Sunbuilt Group', fromEmail: 'hello@sunbuiltgroup.com', signature: 'The Sunbuilt Group Team' },
}

// Known test/seed data that must never receive a real outreach email --
// same exclusion list already established for "real user" reporting
// platform-wide (bario_credentials_reference), plus the account owner's
// own email, which showed up as a literal Sunbuilt "lead" in seed data.
const EXCLUDED_EMAIL_PATTERNS = [/@example\.com$/i, /@bario-internal-test\.com$/i, /@mailtest\.bario\.ca$/i, /^deleted-.*@deleted\.bario\.ca$/i]
const EXCLUDED_EMAILS = new Set(['uniquegroup.org@gmail.com'])

function isRealLeadEmail(email: string): boolean {
  const lower = email.toLowerCase()
  if (EXCLUDED_EMAILS.has(lower)) return false
  return !EXCLUDED_EMAIL_PATTERNS.some((re) => re.test(lower))
}

// Strips the "BARIO Draft: Outreach to X" header line, and replaces the
// unfilled "[Your Name]"/"[Name]" placeholder signature with a real one.
function extractBody(rawNote: string, signature: string): string | null {
  const withoutHeader = rawNote.replace(/^BARIO Draft: Outreach to [^\n]*\n+/, '').trim()
  if (!withoutHeader) return null
  return withoutHeader.replace(/\n*Best,\s*\n*\[(Your Name|Name)\]\s*$/i, `\n\nBest,\n${signature}`)
}

export async function sendIntroOutreachBatch(
  sql: any,
  businessKey: 'afc' | 'sunbuilt',
  limit: number,
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const config = BUSINESS_CONFIG[businessKey]
  const orgId = BARIO_ONE_CALL_LOG_ORG_IDS[businessKey]
  if (!config || !orgId) throw new Error(`Unknown business key: ${businessKey}`)

  // Resend, not Brevo -- afclogistics.ca/sunbuiltgroup.com were verified
  // as sending domains on BARIO's own Resend account specifically (each
  // provider needs its own separate domain verification; a domain
  // verified on Resend isn't usable for sending via Brevo).
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) throw new Error('RESEND_API_KEY is not configured')

  // Real draft + real email + never sent before (bo_outreach_sends is the
  // hard gate; the note-existence check alone isn't enough since a note
  // could exist without ever having actually been emailed).
  const candidates = (await sql`
    SELECT DISTINCT ON (c.id) c.id, c.contact_name, c.email, n.body
    FROM bo_notes n
    JOIN bo_customers c ON c.id = n.customer_id
    WHERE c.organization_id = ${orgId}
      AND n.body ILIKE 'BARIO Draft:%'
      AND c.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM bo_outreach_sends s WHERE s.organization_id = ${orgId} AND s.customer_id = c.id)
    ORDER BY c.id, n.created_at DESC
    LIMIT ${limit * 2}
  `) as { id: string; contact_name: string; email: string; body: string }[]

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of candidates) {
    if (sent >= limit) break
    if (!isRealLeadEmail(row.email)) {
      skipped++
      continue
    }
    const body = extractBody(row.body, config.signature)
    if (!body) {
      skipped++
      continue
    }

    const htmlBody = body
      .split('\n\n')
      .map((para) => `<p style="margin:0 0 14px;">${para.replace(/\n/g, '<br/>')}</p>`)
      .join('')
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px;">${htmlBody}</div>`

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: `${config.name} <${config.fromEmail}>`,
          to: [row.email],
          subject: `Quick question from ${config.name}`,
          html,
        }),
      })
      const ok = res.ok
      await sql`
        INSERT INTO bo_outreach_sends (id, organization_id, customer_id, email, status, error)
        VALUES (${randomUUID()}, ${orgId}, ${row.id}, ${row.email}, ${ok ? 'sent' : 'failed'}, ${ok ? null : await res.text()})
      `
      if (ok) sent++
      else {
        skipped++
        errors.push(`${row.email}: send failed (${res.status})`)
      }
    } catch (e: any) {
      await sql`
        INSERT INTO bo_outreach_sends (id, organization_id, customer_id, email, status, error)
        VALUES (${randomUUID()}, ${orgId}, ${row.id}, ${row.email}, 'failed', ${e?.message ?? 'unknown error'})
      `
      skipped++
      errors.push(`${row.email}: ${e?.message ?? 'unknown error'}`)
    }
  }

  return { sent, skipped, errors: errors.slice(0, 5) }
}
