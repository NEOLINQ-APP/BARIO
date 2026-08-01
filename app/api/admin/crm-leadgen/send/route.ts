import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { findCrm, crmGraphQL } from '@/lib/crmOutreach'
import { sendOutreachEmail } from '@/lib/mailSend'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Explicit, human-triggered send for one drafted outreach note — the only
// place an actual email leaves the building. Deliberately not automatic;
// see the CASL-consideration discussion this shipped alongside. Refuses to
// re-send anything already marked sent_at (idempotent against double-clicks
// or retries).
export async function POST(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    // subject/body are optional overrides — an admin can edit the draft in
    // AdminCrmOutreach before sending; when omitted, falls back to the CRM
    // Note's original AI-drafted text.
    const { crmKey, personId, subject: subjectOverride, body: bodyOverride } = await req.json()
    const crm = findCrm(crmKey)
    if (!crm) return NextResponse.json({ error: 'Unknown crmKey' }, { status: 400 })

    const rows = (await sql`
      SELECT note_id, sent_at FROM crm_leadgen_drafted WHERE crm_key = ${crmKey} AND person_id = ${personId}
    `) as unknown as { note_id: string | null; sent_at: string | null }[]
    const draft = rows[0]
    if (!draft || !draft.note_id) return NextResponse.json({ error: 'No draft found for this contact' }, { status: 404 })
    if (draft.sent_at) return NextResponse.json({ error: 'Already sent' }, { status: 409 })

    const smtpUser = process.env[crm.smtpUserEnvVar]
    const smtpPass = process.env[crm.smtpPassEnvVar]
    if (!smtpUser || !smtpPass) return NextResponse.json({ error: `${crm.smtpUserEnvVar}/${crm.smtpPassEnvVar} not configured` }, { status: 500 })

    const [notesData, personData] = await Promise.all([
      crmGraphQL(crm, `query($ids: [UUID!]) { notes(filter: {id: {in: $ids}}) { edges { node { id title bodyV2 { markdown } } } } }`, { ids: [draft.note_id] }),
      crmGraphQL(crm, `query($id: UUID!) { person(filter: {id: {eq: $id}}) { id emails { primaryEmail } company { name } } }`, { id: personId }),
    ])
    const note = notesData?.notes?.edges?.[0]?.node
    const person = personData?.person
    const email = person?.emails?.primaryEmail
    if (!note) return NextResponse.json({ error: 'Draft note no longer exists in the CRM' }, { status: 404 })
    if (!email) return NextResponse.json({ error: 'Contact no longer has an email on file' }, { status: 400 })

    const subject = subjectOverride?.trim() || (note.title as string)?.replace(/^BARIO Draft: /, '') || `A message from ${crm.businessName}`
    const body = bodyOverride?.trim() || note.bodyV2?.markdown || ''

    const sendResult = await sendOutreachEmail({
      smtpUser,
      smtpPass,
      from: crm.fromAddress,
      to: email,
      subject,
      text: body,
    })

    await sql`
      UPDATE crm_leadgen_drafted
      SET sent_at = now(), sent_email = ${email}, sent_subject = ${subject}, sent_body = ${body}
      WHERE crm_key = ${crmKey} AND person_id = ${personId}
    `
    await logAdminAction(sql, {
      action: 'crm-outreach-sent',
      params: { crmKey, personId, companyName: person.company?.name, email, messageId: sendResult.messageId, edited: !!(subjectOverride || bodyOverride) },
      result: 'ok',
      triggeredBy: 'admin',
    })

    return NextResponse.json({ ok: true, messageId: sendResult.messageId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
