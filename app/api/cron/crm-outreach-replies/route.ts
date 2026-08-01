import { NextResponse } from 'next/server'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { OUTREACH_CRMS, findCrm, crmGraphQL } from '@/lib/crmOutreach'
import { logAdminAction } from '@/lib/adminActions'
import { getOpenAI } from '@/lib/openai'

const VALID_SENTIMENTS = ['interested', 'not_interested', 'ooo_wrong_person', 'neutral'] as const
type Sentiment = (typeof VALID_SENTIMENTS)[number]

// Classifies a reply so AdminCrmOutreach can show it with the right
// urgency/color without a human reading every single one first. A
// misclassification only affects a UI badge and (for not_interested) a
// do-not-contact suppression — never anything that sends mail on its own.
async function classifySentiment(body: string): Promise<Sentiment> {
  try {
    const openai = getOpenAI()
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.6-luna',
      messages: [
        {
          role: 'system',
          content:
            'Classify this email reply into exactly one word: "interested" (wants to talk / asks for more info / positive), "not_interested" (declines, says stop contacting, unsubscribe, not needed), "ooo_wrong_person" (out-of-office auto-reply, or says they are the wrong contact / redirects to someone else), or "neutral" (anything else, unclear, or just a question). Reply with only that one word.',
        },
        { role: 'user', content: body.slice(0, 2000) },
      ],
      max_completion_tokens: 10,
    })
    const raw = completion.choices[0]?.message?.content?.trim().toLowerCase().replace(/[^a-z_]/g, '') ?? ''
    return (VALID_SENTIMENTS as readonly string[]).includes(raw) ? (raw as Sentiment) : 'neutral'
  } catch {
    // A classification failure shouldn't block filing the reply itself —
    // it just shows up untagged (UI treats missing sentiment as neutral).
    return 'neutral'
  }
}

// Polls each outreach mailbox (send.afclogistics.ca / send.sunbuiltgroup.com,
// on the self-hosted Mailcow server) for new inbound mail — real replies to
// the outreach emails sent from app/api/admin/crm-leadgen/send. Matches the
// sender's address back to the contact it was originally sent to
// (crm_leadgen_drafted.sent_email) so a reply shows up against the right
// CRM record. Never auto-responds — just files the reply for a human to
// see in AdminCrmOutreach and choose manual/AI response.
export const maxDuration = 60

async function fetchNewReplies(crm: (typeof OUTREACH_CRMS)[number], sql: any) {
  const user = process.env[crm.smtpUserEnvVar]
  const pass = process.env[crm.smtpPassEnvVar]
  if (!user || !pass) throw new Error(`${crm.smtpUserEnvVar}/${crm.smtpPassEnvVar} not set`)

  const client = new ImapFlow({ host: 'reseller.bario.ca', port: 993, secure: true, auth: { user, pass }, logger: false })
  const found: string[] = []
  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      const searchResult = await client.search({ seen: false }, { uid: true })
      const uids: number[] = searchResult ? searchResult : []
      for (const uid of uids) {
        const { content } = await client.download(String(uid), undefined, { uid: true })
        const chunks: Buffer[] = []
        for await (const chunk of content) chunks.push(chunk as Buffer)
        const parsed = await simpleParser(Buffer.concat(chunks))

        const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase()
        const messageId = parsed.messageId || `${crm.key}-${uid}`
        if (!fromEmail) continue

        const already = await sql`SELECT 1 FROM crm_outreach_replies WHERE message_id = ${messageId}`
        if (already.length > 0) continue

        const sentRow = (await sql`
          SELECT person_id FROM crm_leadgen_drafted WHERE crm_key = ${crm.key} AND sent_email = ${fromEmail} LIMIT 1
        `) as unknown as { person_id: string }[]
        const personId = sentRow[0]?.person_id ?? null
        const replyText = parsed.text ?? ''
        const sentiment = await classifySentiment(replyText)

        await sql`
          INSERT INTO crm_outreach_replies (id, crm_key, person_id, from_email, subject, body, message_id, sentiment)
          VALUES (${randomUUID()}, ${crm.key}, ${personId}, ${fromEmail}, ${parsed.subject ?? ''}, ${replyText}, ${messageId}, ${sentiment})
          ON CONFLICT (message_id) DO NOTHING
        `
        // Contact explicitly declined — stop drafting them future outreach.
        // Never auto-sends anything; just suppresses the leadgen cron.
        if (sentiment === 'not_interested' && personId) {
          await sql`
            INSERT INTO crm_do_not_contact (crm_key, person_id, reason) VALUES (${crm.key}, ${personId}, 'reply classified not_interested')
            ON CONFLICT (crm_key, person_id) DO NOTHING
          `
        }
        found.push(messageId)
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }
  return found
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
  for (const crm of OUTREACH_CRMS) {
    try {
      const found = await fetchNewReplies(crm, sql)
      results.push({ crm: crm.key, newReplies: found.length })
    } catch (err: any) {
      results.push({ crm: crm.key, newReplies: 0, error: err.message })
    }
  }

  const totalNew = results.reduce((n, r) => n + r.newReplies, 0)
  if (totalNew > 0) {
    await logAdminAction(sql, { action: 'crm-outreach-replies-run', params: { results }, result: 'ok', triggeredBy: 'ai_autonomous' })
  }

  return NextResponse.json({ ok: true, results })
}
