import { randomUUID } from 'node:crypto'
import { recalculateLeadScore } from '@/lib/leadPipeline'

// Repoints Victoria's call-logging + caller-context (previously written
// against each business's own standalone Twenty CRM instance, see
// lib/crmOutreach.ts) onto their real Bario One CRM instead, ahead of
// deleting the underlying Twenty stack entirely -- same job, same shape
// the caller-context route already expects ({ personId/customerId,
// firstName, notesSummary }), just against bo_customers/bo_notes.
// AFC/Sunbuilt repointed 2026-08-18. unique/bario repointed 2026-08-20 --
// their Twenty stacks (unique-crm-stack/bario-crm-stack, Hetzner box) had
// already been stopped by the time this was noticed (found ~25h into an
// unplanned outage during an unrelated backup audit); unique's 3 real
// contacts + 6 notes (Victoria's own family-call log — Twenty's 5 default
// demo-seed people were left behind on purpose) were migrated in first
// via a one-off admin route, bario's Twenty had zero real data to lose.
export const BARIO_ONE_CALL_LOG_ORG_IDS: Record<string, string> = {
  afc: 'db97fd81-faee-4489-af7e-3bb813886c53',
  sunbuilt: '2bef423d-737a-4d79-b30c-5ced1fe9ffcb',
  unique: 'f7e3dc4b-fb3c-41eb-a24d-6339491c927c',
  bario: '184e65d3-faf9-4a21-8454-958f106fea06',
}

function last10Digits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

export async function findOrCreateBoCustomerByPhone(sql: any, orgId: string, phoneE164: string, displayName: string | null): Promise<string | null> {
  const target = last10Digits(phoneE164)
  if (!target) return null

  const matchRows = (await sql`
    SELECT id FROM bo_customers
    WHERE organization_id = ${orgId} AND phone IS NOT NULL AND right(regexp_replace(phone, '\D', '', 'g'), 10) = ${target}
    LIMIT 1
  `) as unknown as { id: string }[]
  if (matchRows[0]) return matchRows[0].id

  const id = randomUUID()
  const contactName = displayName?.trim() || 'Unknown Caller'
  await sql`
    INSERT INTO bo_customers (id, organization_id, contact_name, phone, tags_json, source)
    VALUES (${id}, ${orgId}, ${contactName}, ${phoneE164}, '["victoria-call"]', 'victoria_call')
  `
  // Ties Victoria's call intake into the Phase 2 scoring pipeline — a new
  // caller now gets a real score/priority (data-quality signals at
  // minimum) instead of showing blank in the CRM list the way every
  // Victoria-sourced lead did before Phase 6.
  await recalculateLeadScore(sql, orgId, id)
  return id
}

export async function setBoCustomerEmailIfMissing(sql: any, orgId: string, customerId: string, email: string): Promise<void> {
  const target = email.trim().toLowerCase()
  if (!target) return
  const updated = (await sql`
    UPDATE bo_customers SET email = ${target}, updated_at = now() WHERE id = ${customerId} AND email IS NULL RETURNING id
  `) as unknown as { id: string }[]
  // Only recalculate when the email actually changed (the RETURNING check)
  // — a no-op call (email already set) shouldn't write a fresh
  // lead_scores/priority_history row for nothing.
  if (updated.length > 0) await recalculateLeadScore(sql, orgId, customerId)
}

// Repoints app/api/public/site-lead's real, live "a visitor submitted the
// quote/contact form on afclogistics.ca or sunbuiltgroup.com" path onto
// Bario One's CRM instead of Twenty -- this one is genuinely public and
// unauthenticated, so leaving it pointed at a deleted Twenty instance
// would have failed every real form submission on both client sites, not
// just an internal tool. Matched on email (a web form always has one,
// unlike a phone call), mirrors findOrCreatePersonByEmail's shape.
export async function findOrCreateBoCustomerByEmail(sql: any, orgId: string, email: string, displayName: string | null, phone: string | null): Promise<string | null> {
  const target = email.trim().toLowerCase()
  if (!target) return null

  const matchRows = (await sql`
    SELECT id FROM bo_customers WHERE organization_id = ${orgId} AND lower(email) = ${target} LIMIT 1
  `) as unknown as { id: string }[]
  if (matchRows[0]) return matchRows[0].id

  const id = randomUUID()
  const contactName = displayName?.trim() || 'Unknown'
  await sql`
    INSERT INTO bo_customers (id, organization_id, contact_name, email, phone, tags_json, source)
    VALUES (${id}, ${orgId}, ${contactName}, ${target}, ${phone}, '["website-lead"]', 'website_form')
  `
  await recalculateLeadScore(sql, orgId, id)
  return id
}

// Repoints components/BarioDialer.tsx's Contacts tab for AFC/Sunbuilt onto
// Bario One's CRM -- shape matches exactly what the dialer already expects
// from the Twenty-backed route (personId/name/companyName/phone) so the
// frontend needs zero changes.
export async function listBoContactsWithPhone(sql: any, orgId: string): Promise<{ personId: string; name: string; companyName: string | null; phone: string }[]> {
  const rows = (await sql`
    SELECT id, contact_name, company_name, phone FROM bo_customers
    WHERE organization_id = ${orgId} AND phone IS NOT NULL AND phone <> ''
    ORDER BY contact_name ASC
  `) as unknown as { id: string; contact_name: string; company_name: string | null; phone: string }[]
  return rows.map((r) => ({ personId: r.id, name: r.contact_name || 'Unknown', companyName: r.company_name, phone: r.phone }))
}

export async function createBoContact(sql: any, orgId: string, opts: { firstName: string; lastName: string; phone: string; email: string; companyName: string }): Promise<string> {
  const id = randomUUID()
  const contactName = `${opts.firstName} ${opts.lastName}`.trim() || 'Unknown'
  await sql`
    INSERT INTO bo_customers (id, organization_id, contact_name, company_name, phone, email, tags_json, source)
    VALUES (${id}, ${orgId}, ${contactName}, ${opts.companyName || null}, ${opts.phone}, ${opts.email || null}, '["dialer-added"]', 'dialer')
  `
  await recalculateLeadScore(sql, orgId, id)
  return id
}

export async function logBoWebLeadNote(sql: any, orgId: string, customerId: string, source: string, body: string): Promise<void> {
  await sql`
    INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
    VALUES (${randomUUID()}, ${orgId}, ${customerId}, 'note', ${`New website lead (${source})\n\n${body}`})
  `
}

export async function logBoCallNote(
  sql: any,
  orgId: string,
  customerId: string,
  direction: string,
  summary: string | null,
  durationSeconds: number,
  personalNotes?: string | null
): Promise<void> {
  const when = new Date().toLocaleString('en-CA', { timeZone: 'America/Edmonton', dateStyle: 'medium', timeStyle: 'short' })
  const title = `Victoria call (${direction}) — ${when}`
  const summaryText = summary?.trim() || `${direction === 'inbound' ? 'Inbound' : 'Outbound'} call, ${durationSeconds}s. No summary captured.`
  const body = personalNotes?.trim() ? `${title}\n\n${summaryText}\n\n${personalNotes.trim()}` : `${title}\n\n${summaryText}`

  await sql`
    INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
    VALUES (${randomUUID()}, ${orgId}, ${customerId}, 'call', ${body})
  `
}

// Mirrors lib/crmOutreach.ts's fetchPriorCallContext() return shape
// exactly (firstName + notesSummary joined from up to 5 recent notes) so
// the caller-context route's response to Victoria doesn't need to change
// shape depending on which backend an org uses.
export async function fetchPriorBoCallContext(sql: any, orgId: string, phoneE164: string): Promise<{ customerId: string; firstName: string | null; notesSummary: string } | null> {
  const target = last10Digits(phoneE164)
  if (!target) return null
  try {
    const matchRows = (await sql`
      SELECT id, contact_name FROM bo_customers
      WHERE organization_id = ${orgId} AND phone IS NOT NULL AND right(regexp_replace(phone, '\D', '', 'g'), 10) = ${target}
      LIMIT 1
    `) as unknown as { id: string; contact_name: string }[]
    const match = matchRows[0]
    if (!match) return null

    const noteRows = (await sql`
      SELECT body FROM bo_notes WHERE customer_id = ${match.id} ORDER BY created_at DESC LIMIT 5
    `) as unknown as { body: string }[]
    if (noteRows.length === 0) return null
    const notesSummary = noteRows.map((r) => r.body).filter(Boolean).join('\n---\n')
    if (!notesSummary.trim()) return null

    const firstName = match.contact_name?.split(' ')[0] || null
    return { customerId: match.id, firstName, notesSummary }
  } catch (err) {
    console.error('fetchPriorBoCallContext failed', err)
    return null
  }
}
