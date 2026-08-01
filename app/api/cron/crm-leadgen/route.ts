import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOpenAI } from '@/lib/openai'
import { logAdminAction } from '@/lib/adminActions'

// Drafts a personalized outreach email for each new CRM contact and logs it
// as a Note on their record for a human to review and send — it does NOT
// send anything itself. Sending "as" afclogistics.ca or sunbuiltgroup.com
// needs a verified sending domain/mailbox for each business, which doesn't
// exist yet (their real email still lives on their original hosts). Once
// that's set up, this is the one place to wire actual sending in.
export const maxDuration = 120

// Caps how many NEW (not-yet-drafted) contacts get an AI draft per
// invocation — with hundreds of contacts across both CRMs, drafting all of
// them wouldn't fit in maxDuration. Already-drafted contacts are skipped
// cheaply (one SQL check), so calling this repeatedly picks up where the
// last run left off rather than reprocessing the same page every time.
const MAX_NEW_PER_RUN = 20

type CrmConfig = {
  key: string
  businessName: string
  graphqlUrl: string
  apiKeyEnvVar: string
  context: string
}

const CRMS: CrmConfig[] = [
  {
    key: 'afc',
    businessName: 'AFC Logistics',
    graphqlUrl: 'https://afc.crm.bario.ca/graphql',
    apiKeyEnvVar: 'AFC_CRM_API_KEY',
    context: 'A trucking and freight logistics company in Canada.',
  },
  {
    key: 'sunbuilt',
    businessName: 'Sunbuilt Group',
    graphqlUrl: 'https://sunbuilt.crm.bario.ca/graphql',
    apiKeyEnvVar: 'SUNBUILT_CRM_API_KEY',
    context: 'A licensed Alberta construction, renovation and custom-build company.',
  },
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

async function draftOutreachEmail(crm: CrmConfig, person: { firstName: string; lastName: string; companyName: string | null }) {
  const openai = getOpenAI()
  const completion = await openai.chat.completions.create({
    model: 'gpt-5.6-luna',
    messages: [
      {
        role: 'system',
        content: `You draft short, genuine-sounding first-touch sales outreach emails for ${crm.businessName}, written as if from a real person on their team. ${crm.context} No fluff, no hype, no "I hope this finds you well." One clear reason to reply. Under 120 words. Never mention AI, automation, being a bot/assistant, or that the email was generated or drafted by anything other than a person — write it exactly as a human sender would. Return ONLY the email body text, no subject line, no markdown headers.`,
      },
      {
        role: 'user',
        content: `Draft an outreach email to ${person.firstName} ${person.lastName}${person.companyName ? ` at ${person.companyName}` : ''}.`,
      },
    ],
    max_completion_tokens: 400,
  })
  return completion.choices[0]?.message?.content?.trim() || ''
}

async function processCrm(crm: CrmConfig, sql: any) {
  const result = { crm: crm.key, drafted: [] as string[], errors: [] as string[] }

  const data = await crmGraphQL(
    crm,
    `query { people(first: 500) { edges { node { id name { firstName lastName } company { name } } } } }`,
    {}
  )
  const people = (data?.people?.edges ?? []).map((e: any) => e.node)

  for (const person of people) {
    if (result.drafted.length >= MAX_NEW_PER_RUN) break
    try {
      const already = await sql`SELECT 1 FROM crm_leadgen_drafted WHERE crm_key = ${crm.key} AND person_id = ${person.id}`
      if (already.length > 0) continue
      // Skip anyone who explicitly declined via a reply classified
      // not_interested (see app/api/cron/crm-outreach-replies) — never
      // re-draft outreach to someone who asked to be left alone.
      const declined = await sql`SELECT 1 FROM crm_do_not_contact WHERE crm_key = ${crm.key} AND person_id = ${person.id}`
      if (declined.length > 0) continue

      const firstName = person.name?.firstName || ''
      const lastName = person.name?.lastName || ''
      const companyName = person.company?.name || null
      const emailBody = await draftOutreachEmail(crm, { firstName, lastName, companyName })
      if (!emailBody) continue

      const noteData = await crmGraphQL(
        crm,
        `mutation($data: NoteCreateInput!){ createNote(data: $data) { id } }`,
        { data: { title: `BARIO Draft: Outreach to ${firstName} ${lastName}`.trim(), bodyV2: { markdown: emailBody } } }
      )
      const noteId = noteData.createNote.id

      await crmGraphQL(
        crm,
        `mutation($data: NoteTargetCreateInput!){ createNoteTarget(data: $data) { id } }`,
        { data: { noteId, targetPersonId: person.id } }
      )

      await sql`
        INSERT INTO crm_leadgen_drafted (crm_key, person_id, note_id) VALUES (${crm.key}, ${person.id}, ${noteId})
        ON CONFLICT (crm_key, person_id) DO NOTHING
      `
      result.drafted.push(person.id)
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
      results.push({ crm: crm.key, drafted: [], errors: [err.message] })
    }
  }

  const totalDrafted = results.reduce((n, r) => n + r.drafted.length, 0)
  const totalErrors = results.reduce((n, r) => n + r.errors.length, 0)
  if (totalDrafted > 0 || totalErrors > 0) {
    await logAdminAction(sql, {
      action: 'crm-leadgen-run',
      params: { results },
      result: totalErrors > 0 && totalDrafted === 0 ? 'error' : 'ok',
      triggeredBy: 'ai_autonomous',
    })
  }

  return NextResponse.json({ ok: true, results })
}
