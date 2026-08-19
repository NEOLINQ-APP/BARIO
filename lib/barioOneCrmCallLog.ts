import { randomUUID } from 'node:crypto'

// Repoints Victoria's call-logging + caller-context (previously written
// against AFC's and Sunbuilt's standalone Twenty CRM instances, see
// lib/crmOutreach.ts) onto their real Bario One CRM instead, ahead of
// deleting those two Twenty stacks entirely (2026-08-18) -- same job,
// same shape the caller-context route already expects
// ({ personId/customerId, firstName, notesSummary }), just against
// bo_customers/bo_notes. Unique Group's and Bario.ca's own Twenty stacks
// are untouched and keep using lib/crmOutreach.ts as before -- this file
// only covers the two orgs whose Twenty backend is going away.
export const BARIO_ONE_CALL_LOG_ORG_IDS: Record<string, string> = {
  afc: 'db97fd81-faee-4489-af7e-3bb813886c53',
  sunbuilt: '2bef423d-737a-4d79-b30c-5ced1fe9ffcb',
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
    INSERT INTO bo_customers (id, organization_id, contact_name, phone, tags_json)
    VALUES (${id}, ${orgId}, ${contactName}, ${phoneE164}, '["victoria-call"]')
  `
  return id
}

export async function setBoCustomerEmailIfMissing(sql: any, customerId: string, email: string): Promise<void> {
  const target = email.trim().toLowerCase()
  if (!target) return
  await sql`UPDATE bo_customers SET email = ${target}, updated_at = now() WHERE id = ${customerId} AND email IS NULL`
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
