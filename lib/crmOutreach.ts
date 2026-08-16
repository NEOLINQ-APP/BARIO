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
  // Click-to-call (lib/twilio.ts): twilioNumber is the business's own real
  // Twilio number (used as the lead-facing caller ID), forwardToNumber is
  // the real staff phone dialed FIRST for the phone-bridge path — once they
  // pick up, Twilio bridges them to the lead. twimlAppSid is for the
  // browser-based Bario Dialer PWA (Twilio Voice SDK) — Twilio calls
  // app/api/twilio/browser-call for any outbound call placed through that
  // Application, regardless of which staff member's browser initiated it.
  // All already provisioned/verified live on the Unique Group Twilio
  // (sub)account, one number + one Application per business.
  twilioNumber: string
  forwardToNumber: string
  twimlAppSid: string
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
    twilioNumber: '+18253607175',
    forwardToNumber: '+17809778865',
    twimlAppSid: 'APee46b91de81c9f57efad2e042fbc3f19',
  },
  {
    key: 'sunbuilt',
    businessName: 'Sunbuilt Group',
    graphqlUrl: 'https://sunbuilt.crm.bario.ca/graphql',
    apiKeyEnvVar: 'SUNBUILT_CRM_API_KEY',
    fromAddress: '"Sunbuilt Group" <outreach@send.sunbuiltgroup.com>',
    smtpUserEnvVar: 'SUNBUILT_OUTREACH_SMTP_USER',
    smtpPassEnvVar: 'SUNBUILT_OUTREACH_SMTP_PASS',
    twilioNumber: '+18254352121',
    forwardToNumber: '+14164572224',
    twimlAppSid: 'APe0558e2920449e49a09ded2f992dac81',
  },
  {
    key: 'unique',
    businessName: 'Unique Group Inc.',
    graphqlUrl: 'https://unique.crm.bario.ca/graphql',
    apiKeyEnvVar: 'UNIQUE_CRM_API_KEY',
    // No outreach campaigns run for Bario's own house businesses today —
    // these two fields exist only because CrmConfig requires them. Real
    // env vars, just unset; lib/crmOutreach.ts's send path already throws
    // a clear "not configured" error rather than crashing if ever hit.
    fromAddress: '"Unique Group Inc." <hello@bario.ca>',
    smtpUserEnvVar: 'UNIQUE_OUTREACH_SMTP_USER',
    smtpPassEnvVar: 'UNIQUE_OUTREACH_SMTP_PASS',
    twilioNumber: '+12367070808',
    forwardToNumber: '+17802410880',
    twimlAppSid: 'AP5f6f10b5122ffb7deb4863ba747197ea',
  },
  {
    key: 'bario',
    businessName: 'Bario.ca',
    graphqlUrl: 'https://bario.crm.bario.ca/graphql',
    apiKeyEnvVar: 'BARIO_CRM_API_KEY',
    fromAddress: '"Bario.ca" <hello@bario.ca>',
    smtpUserEnvVar: 'BARIO_OUTREACH_SMTP_USER',
    smtpPassEnvVar: 'BARIO_OUTREACH_SMTP_PASS',
    twilioNumber: '+12365004678',
    forwardToNumber: '+18259639988',
    twimlAppSid: 'AP3987c6b53d478f20f20da8e7956a4057',
  },
]

export function findCrm(key: string): CrmConfig | undefined {
  return OUTREACH_CRMS.find((c) => c.key === key)
}

// Tone options for AI-drafted outreach/replies (see draft-reply and
// redraft routes) — the prompt instruction per tone, plus a label for the
// admin UI dropdown. Every tone still obeys the no-AI-disclosure rule.
export const EMAIL_TONES = {
  professional: { label: 'Professional', instruction: 'Formal, polished, businesslike. No slang, no exclamation points.' },
  friendly: { label: 'Friendly', instruction: 'Warm and approachable, like a helpful colleague, still respectful of their time.' },
  funny: { label: 'Funny', instruction: 'Genuinely light and a little witty — a real, tasteful joke or playful line, not corny or forced. Still gets the actual point across clearly.' },
  casual: { label: 'Casual', instruction: 'Relaxed and conversational, like texting someone you know a bit, but still coherent and professional enough for a first business contact.' },
  urgent: { label: 'Urgent', instruction: 'Conveys real time-sensitivity and a clear reason to respond soon, without sounding pushy or fake-urgent.' },
  anxious: { label: 'Anxious / concerned', instruction: 'Sounds genuinely worried about missing an opportunity or a real problem needing attention — earnest and a little uneasy, not calm or detached.' },
} as const
export type EmailTone = keyof typeof EMAIL_TONES
export function isEmailTone(v: unknown): v is EmailTone {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(EMAIL_TONES, v)
}

// The 14 B2B email types the user specified, generalized to work for
// either CRM (businessName/context substituted in, same as the existing
// draft prompts) rather than hardcoded to one business. `instruction` is
// the actual content brief passed to the model; `suggestedTiming` is
// display-only context for the admin picking a type — there's no automated
// day/time-of-week scheduler behind it (that's real, separate follow-up
// work, not built here).
export const EMAIL_TYPES = {
  direct_pitch: {
    label: 'Direct Commercial Pitch',
    purpose: 'Acquisition, repositioning, and scope capability.',
    suggestedTiming: 'Tuesday @ 8:15 AM',
    instruction: 'A direct commercial pitch. Mention the business\'s core specialty and service area. End with a low-pressure question asking if they have upcoming projects needing a reliable partner.',
  },
  unit_turnover: {
    label: 'Unit Turnover / Maintenance',
    purpose: 'Targets property managers needing quick contractor turnaround.',
    suggestedTiming: 'Wednesday @ 7:45 AM',
    instruction: 'Targeted at property management companies for unit turnovers and maintenance repairs. Direct and focused on fast turnarounds and quality work. Ask if they are currently accepting new vendors on their approved contractor list.',
  },
  pre_budget: {
    label: 'Pre-Budget / Planning',
    purpose: 'Reaches decision-makers during their budget planning cycle.',
    suggestedTiming: 'Thursday @ 8:30 AM',
    instruction: 'To real estate investors or asset managers, offering early-stage scope assessment and budgeting help for planned renovations or capital improvements.',
  },
  backup_partner: {
    label: 'Subcontractor / Backup Partner',
    purpose: 'Positions the business as a backup when current contractors fail.',
    suggestedTiming: 'Tuesday @ 1:15 PM',
    instruction: 'Offers the business as a reliable backup partner when their current contractor is booked up or delayed. Focus on reliability and clear timelines.',
  },
  local_reference: {
    label: 'Local Project Reference',
    purpose: 'Mentions local experience or scope capability.',
    suggestedTiming: 'Wednesday @ 2:00 PM',
    instruction: 'Emphasizes local licensing, safety compliance, and project delivery experience in the region. Simple call to action: a 5-minute phone alignment.',
  },
  gentle_bump: {
    label: '"Gentle Bump" Follow-Up',
    purpose: 'Short follow-up to unread/unanswered initial outreach.',
    suggestedTiming: '3 days later @ 8:45 AM',
    instruction: 'A 2-sentence follow-up to a previous unanswered note. Just ask if the previous email made it to the right person regarding support for their upcoming projects.',
  },
  value_add: {
    label: 'Value-Add / Scope Checklist',
    purpose: 'Offers a brief site walkthrough or scope assessment.',
    suggestedTiming: 'Thursday @ 9:00 AM',
    instruction: 'Offers a quick, complimentary on-site scope assessment for any project the contact may be reviewing this quarter. Clean and direct.',
  },
  rapid_response: {
    label: 'Emergency / Rapid Response',
    purpose: 'Highlights fast mobilization for urgent repairs.',
    suggestedTiming: 'Monday @ 8:00 AM',
    instruction: 'Highlights the ability to mobilize quickly for urgent repairs, structural updates, or emergency situations.',
  },
  seasonal: {
    label: 'Seasonal Maintenance Offer',
    purpose: 'Winterization, spring repairs, or exterior work.',
    suggestedTiming: 'Wednesday @ 8:15 AM',
    instruction: 'A seasonal outreach offering repairs, site updates, or maintenance before the season changes. Focus on protecting asset/property value.',
  },
  capex: {
    label: 'CapEx / Facility Upgrade',
    purpose: 'Targets capital expenditure projects for building owners.',
    suggestedTiming: 'Tuesday @ 1:45 PM',
    instruction: 'Tailored for asset managers addressing capital expenditure projects. Highlight clear planning, budgeting, and project execution.',
  },
  re_engagement: {
    label: 'Break-in / Re-engagement',
    purpose: 'For cold leads that went quiet months ago.',
    suggestedTiming: 'Tuesday @ 10:15 AM',
    instruction: 'For a lead that hasn\'t replied in a long while. Ask if relevant projects are back on their radar for the upcoming quarter.',
  },
  case_study: {
    label: 'Case Study / Before & After',
    purpose: 'Text summary of a recently completed project success.',
    suggestedTiming: 'Thursday @ 1:30 PM',
    instruction: 'A brief 3-bullet-point email describing how the business recently completed a project on time and within budget, then ask if the contact needs similar support.',
  },
  breakup: {
    label: '"Breakup" Email',
    purpose: 'Final quick note asking if project timing is off right now.',
    suggestedTiming: 'Wednesday @ 3:00 PM',
    instruction: 'A polite, 2-line final outreach asking whether to close their file for now, or check back in 6 months when new projects start.',
  },
  post_meeting: {
    label: 'Post-Meeting Thank You',
    purpose: 'Immediate follow-up after a phone call or site walk.',
    suggestedTiming: 'Within 2 hours of the call',
    instruction: 'A quick thank-you following up after a brief intro call. Summarize that you look forward to reviewing their scope details and delivering a proposal.',
  },
} as const
export type EmailTypeKey = keyof typeof EMAIL_TYPES
export function isEmailTypeKey(v: unknown): v is EmailTypeKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(EMAIL_TYPES, v)
}

// Hard block on unresolved placeholders — [Name], [Your Name], [Company],
// {{Company Name}}, etc. Catches exactly the "Hi [Company Name] team"
// failure mode: an AI draft (or a manual edit) that left a template
// bracket in place. Checked inside deliverOutreach/deliverReplyResponse
// themselves so it applies no matter which route triggers a send —
// immediate, scheduled, or a reply response.
const PLACEHOLDER_RE = /\[[^\]\n]{1,40}\]|\{\{[^}\n]{1,40}\}\}/
export function findPlaceholder(text: string): string | null {
  const match = text.match(PLACEHOLDER_RE)
  return match ? match[0] : null
}

// NA-only heuristic (last 10 digits) so a contact hand-entered as
// "780-909-2424" still matches Twilio's E.164 "+17809092424" — this app's
// existing contacts (see create-contact/route.ts) were saved with whatever
// format a human typed, not a normalized one.
function last10Digits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

// Used by the Victoria call-log route to attach every real inbound/outbound
// call to the right business's Twenty CRM contact — finds an existing
// Person by phone, or creates one, so a call never gets silently dropped
// just because the caller isn't in the CRM yet.
export async function findOrCreatePersonByPhone(crm: CrmConfig, phoneE164: string, displayName: string | null): Promise<string | null> {
  const target = last10Digits(phoneE164)
  if (!target) return null

  const peopleData = await crmGraphQL(
    crm,
    `query { people(first: 1000) { edges { node { id phones { primaryPhoneNumber } } } } }`,
    {}
  )
  const edges: any[] = peopleData?.people?.edges ?? []
  const match = edges.find((e) => last10Digits(e?.node?.phones?.primaryPhoneNumber ?? '') === target)
  if (match) return match.node.id as string

  const firstName = displayName?.trim() || 'Unknown Caller'
  const created = await crmGraphQL(
    crm,
    `mutation($data: PersonCreateInput!) { createPerson(data: $data) { id } }`,
    { data: { name: { firstName, lastName: '' }, phones: { primaryPhoneNumber: phoneE164, primaryPhoneCallingCode: '' } } }
  )
  return (created?.createPerson?.id as string) ?? null
}

// Best-effort — only touches email since that's a standard Person field
// with a well-established shape elsewhere in this file (create-contact
// route). Never overwrites an existing email with a blank/different one
// mid-call by mistake — only sets it when the record doesn't have one yet,
// since Victoria doesn't have a way to confirm "is this a correction or a
// mishearing" over the phone.
export async function setPersonEmailIfMissing(crm: CrmConfig, personId: string, email: string): Promise<void> {
  const target = email.trim().toLowerCase()
  if (!target) return
  const existing = await crmGraphQL(crm, `query($id: UUID!) { person(filter: { id: { eq: $id } }) { emails { primaryEmail } } }`, { id: personId }).catch(() => null)
  if (existing?.person?.emails?.primaryEmail) return
  await crmGraphQL(
    crm,
    `mutation($id: ID!, $data: PersonUpdateInput!) { updatePerson(id: $id, data: $data) { id } }`,
    { id: personId, data: { emails: { primaryEmail: target, additionalEmails: [] } } }
  ).catch((err) => console.error('setPersonEmailIfMissing failed', err))
}

// Logs one completed Victoria call as a Note on the matched Person —
// mirrors the exact createNote/createNoteTarget shape already proven out
// in app/api/cron/crm-leadgen/route.ts. personalNotes is free text (e.g.
// mailing address given verbally, personality/attitude read) appended
// under the summary — kept as plain note content rather than forced into
// a structured Person field neither of us has verified actually exists on
// this schema.
export async function logCallNote(crm: CrmConfig, personId: string, direction: string, summary: string | null, durationSeconds: number, personalNotes?: string | null) {
  const when = new Date().toLocaleString('en-CA', { timeZone: 'America/Edmonton', dateStyle: 'medium', timeStyle: 'short' })
  const title = `Victoria call (${direction}) — ${when}`
  const summaryText = summary?.trim() || `${direction === 'inbound' ? 'Inbound' : 'Outbound'} call, ${durationSeconds}s. No summary captured.`
  const body = personalNotes?.trim() ? `${summaryText}\n\n${personalNotes.trim()}` : summaryText

  const noteData = await crmGraphQL(
    crm,
    `mutation($data: NoteCreateInput!){ createNote(data: $data) { id } }`,
    { data: { title, bodyV2: { markdown: body } } }
  )
  const noteId = noteData?.createNote?.id
  if (!noteId) return

  await crmGraphQL(
    crm,
    `mutation($data: NoteTargetCreateInput!){ createNoteTarget(data: $data) { id } }`,
    { data: { noteId, targetPersonId: personId } }
  )
}

// Pulls prior call Notes for a matched Person so Victoria can be briefed
// at the START of a new call ("you've spoken with this caller before") —
// the missing half of the existing log-call-at-hangup flow, which only
// ever wrote memory, never read it back. Returns null on no match/no
// notes/any failure — caller must treat that as "nothing known," never as
// an error worth surfacing to the caller on the phone.
export async function fetchPriorCallContext(crm: CrmConfig, phoneE164: string): Promise<{ personId: string; firstName: string | null; notesSummary: string } | null> {
  const target = last10Digits(phoneE164)
  if (!target) return null
  try {
    const peopleData = await crmGraphQL(
      crm,
      `query { people(first: 1000) { edges { node { id name { firstName } phones { primaryPhoneNumber } } } } }`,
      {}
    )
    const edges: any[] = peopleData?.people?.edges ?? []
    const match = edges.find((e) => last10Digits(e?.node?.phones?.primaryPhoneNumber ?? '') === target)
    if (!match) return null
    const personId = match.node.id as string
    const firstName = (match.node.name?.firstName as string) || null

    const notesData = await crmGraphQL(
      crm,
      `query($id: UUID!) { noteTargets(filter: { personId: { eq: $id } }, first: 5, orderBy: { note: { createdAt: DescNullsLast } }) { edges { node { note { title bodyV2 { markdown } } } } } }`,
      { id: personId }
    )
    const noteEdges: any[] = notesData?.noteTargets?.edges ?? []
    if (noteEdges.length === 0) return null
    const notesSummary = noteEdges
      .map((e) => e?.node?.note?.bodyV2?.markdown as string | undefined)
      .filter(Boolean)
      .slice(0, 5)
      .join('\n---\n')
    if (!notesSummary.trim()) return null
    return { personId, firstName, notesSummary }
  } catch (err) {
    console.error('fetchPriorCallContext failed', err)
    return null
  }
}

// Used by the public site-lead route so a real visitor's estimate/contact
// form submission on a client's own site (sunbuiltgroup.com, afclogistics.ca)
// reaches that business's real Twenty CRM — mirrors findOrCreatePersonByPhone
// above, matched on email instead of phone since a web form always has an
// email but not always a phone.
export async function findOrCreatePersonByEmail(crm: CrmConfig, email: string, displayName: string | null, phoneE164: string | null): Promise<string | null> {
  const target = email.trim().toLowerCase()
  if (!target) return null

  const peopleData = await crmGraphQL(
    crm,
    `query { people(first: 1000) { edges { node { id emails { primaryEmail } } } } }`,
    {}
  )
  const edges: any[] = peopleData?.people?.edges ?? []
  const match = edges.find((e) => (e?.node?.emails?.primaryEmail ?? '').trim().toLowerCase() === target)
  if (match) return match.node.id as string

  const firstName = displayName?.trim() || 'Website Lead'
  const created = await crmGraphQL(
    crm,
    `mutation($data: PersonCreateInput!) { createPerson(data: $data) { id } }`,
    {
      data: {
        name: { firstName, lastName: '' },
        emails: { primaryEmail: target },
        ...(phoneE164 ? { phones: { primaryPhoneNumber: phoneE164, primaryPhoneCallingCode: '' } } : {}),
      },
    }
  )
  return (created?.createPerson?.id as string) ?? null
}

// Logs one web-form lead submission as a Note on the matched Person —
// same createNote/createNoteTarget shape as logCallNote above.
export async function logWebLeadNote(crm: CrmConfig, personId: string, source: string, body: string) {
  const when = new Date().toLocaleString('en-CA', { timeZone: 'America/Edmonton', dateStyle: 'medium', timeStyle: 'short' })
  const title = `Website lead (${source}) — ${when}`

  const noteData = await crmGraphQL(
    crm,
    `mutation($data: NoteCreateInput!){ createNote(data: $data) { id } }`,
    { data: { title, bodyV2: { markdown: body } } }
  )
  const noteId = noteData?.createNote?.id
  if (!noteId) return

  await crmGraphQL(
    crm,
    `mutation($data: NoteTargetCreateInput!){ createNoteTarget(data: $data) { id } }`,
    { data: { noteId, targetPersonId: personId } }
  )
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

  const placeholder = findPlaceholder(subject) || findPlaceholder(body)
  if (placeholder) throw new Error(`Blocked: draft still contains an unfilled placeholder (${placeholder}) — edit it before sending`)

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

  const placeholder = findPlaceholder(subject) || findPlaceholder(body)
  if (placeholder) throw new Error(`Blocked: response still contains an unfilled placeholder (${placeholder}) — edit it before sending`)

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
