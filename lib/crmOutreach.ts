// Shared CRM-GraphQL config/helpers for the human-reviews-then-sends
// outreach flow (app/api/admin/crm-leadgen/*). Separate from
// app/api/cron/crm-leadgen's own copy since that route is cron-only and
// this is reused by two admin routes plus the enrichment cron.
export type CrmConfig = {
  key: string
  businessName: string
  graphqlUrl: string
  apiKeyEnvVar: string
  fromAddress: string
  smtpUserEnvVar: string
  smtpPassEnvVar: string
}

export const OUTREACH_CRMS: CrmConfig[] = [
  {
    key: 'afc',
    businessName: 'AFC Logistics',
    graphqlUrl: 'https://afc.crm.bario.ca/graphql',
    apiKeyEnvVar: 'AFC_CRM_API_KEY',
    fromAddress: '"AFC Logistics" <outreach@send.afclogistics.ca>',
    smtpUserEnvVar: 'AFC_OUTREACH_SMTP_USER',
    smtpPassEnvVar: 'AFC_OUTREACH_SMTP_PASS',
  },
  {
    key: 'sunbuilt',
    businessName: 'Sunbuilt Group',
    graphqlUrl: 'https://sunbuilt.crm.bario.ca/graphql',
    apiKeyEnvVar: 'SUNBUILT_CRM_API_KEY',
    fromAddress: '"Sunbuilt Group" <outreach@send.sunbuiltgroup.com>',
    smtpUserEnvVar: 'SUNBUILT_OUTREACH_SMTP_USER',
    smtpPassEnvVar: 'SUNBUILT_OUTREACH_SMTP_PASS',
  },
]

export function findCrm(key: string): CrmConfig | undefined {
  return OUTREACH_CRMS.find((c) => c.key === key)
}

export async function crmGraphQL(crm: CrmConfig, query: string, variables: Record<string, unknown>) {
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

// Shared by the immediate-send route and the scheduled-send cron so the two
// paths can't drift — actually delivers one drafted outreach email and
// records what was sent.
export async function deliverOutreach(
  sql: any,
  crm: CrmConfig,
  personId: string,
  noteId: string,
  subjectOverride?: string | null,
  bodyOverride?: string | null
) {
  const { sendOutreachEmail } = await import('./mailSend')
  const { logAdminAction } = await import('./adminActions')

  const smtpUser = process.env[crm.smtpUserEnvVar]
  const smtpPass = process.env[crm.smtpPassEnvVar]
  if (!smtpUser || !smtpPass) throw new Error(`${crm.smtpUserEnvVar}/${crm.smtpPassEnvVar} not configured`)

  const [notesData, personData] = await Promise.all([
    crmGraphQL(crm, `query($ids: [UUID!]) { notes(filter: {id: {in: $ids}}) { edges { node { id title bodyV2 { markdown } } } } }`, { ids: [noteId] }),
    crmGraphQL(crm, `query($id: UUID!) { person(filter: {id: {eq: $id}}) { id emails { primaryEmail } company { name } } }`, { id: personId }),
  ])
  const note = notesData?.notes?.edges?.[0]?.node
  const person = personData?.person
  const email = person?.emails?.primaryEmail
  if (!note) throw new Error('Draft note no longer exists in the CRM')
  if (!email) throw new Error('Contact no longer has an email on file')

  const subject = subjectOverride?.trim() || (note.title as string)?.replace(/^BARIO Draft: /, '') || `A message from ${crm.businessName}`
  const body = bodyOverride?.trim() || note.bodyV2?.markdown || ''

  const sendResult = await sendOutreachEmail({ smtpUser, smtpPass, from: crm.fromAddress, to: email, subject, text: body })

  await sql`
    UPDATE crm_leadgen_drafted
    SET sent_at = now(), sent_email = ${email}, sent_subject = ${subject}, sent_body = ${body},
        scheduled_at = NULL, scheduled_subject = NULL, scheduled_body = NULL
    WHERE crm_key = ${crm.key} AND person_id = ${personId}
  `
  await logAdminAction(sql, {
    action: 'crm-outreach-sent',
    params: { crmKey: crm.key, personId, companyName: person.company?.name, email, messageId: sendResult.messageId },
    result: 'ok',
    triggeredBy: 'admin',
  })
  return sendResult
}

// Same idea for reply responses.
export async function deliverReplyResponse(sql: any, crm: CrmConfig, replyId: string, toEmail: string, subjectBase: string, body: string, mode: 'manual' | 'ai') {
  const { sendOutreachEmail } = await import('./mailSend')
  const { logAdminAction } = await import('./adminActions')

  const smtpUser = process.env[crm.smtpUserEnvVar]
  const smtpPass = process.env[crm.smtpPassEnvVar]
  if (!smtpUser || !smtpPass) throw new Error(`${crm.smtpUserEnvVar}/${crm.smtpPassEnvVar} not configured`)

  const subject = subjectBase?.toLowerCase().startsWith('re:') ? subjectBase : `Re: ${subjectBase || 'your message'}`
  const sendResult = await sendOutreachEmail({ smtpUser, smtpPass, from: crm.fromAddress, to: toEmail, subject, text: body })

  await sql`
    UPDATE crm_outreach_replies
    SET response_mode = ${mode}, response_body = ${body}, response_sent_at = now(),
        scheduled_response_at = NULL, scheduled_response_body = NULL, scheduled_response_mode = NULL
    WHERE id = ${replyId}
  `
  await logAdminAction(sql, {
    action: 'crm-outreach-reply-sent',
    params: { crmKey: crm.key, replyId, to: toEmail, mode, messageId: sendResult.messageId },
    result: 'ok',
    triggeredBy: 'admin',
  })
  return sendResult
}
