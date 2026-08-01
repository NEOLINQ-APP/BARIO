import { NextResponse } from 'next/server'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { OUTREACH_CRMS, findCrm, crmGraphQL } from '@/lib/crmOutreach'
import { logAdminAction } from '@/lib/adminActions'

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

        await sql`
          INSERT INTO crm_outreach_replies (id, crm_key, person_id, from_email, subject, body, message_id)
          VALUES (${randomUUID()}, ${crm.key}, ${personId}, ${fromEmail}, ${parsed.subject ?? ''}, ${parsed.text ?? ''}, ${messageId})
          ON CONFLICT (message_id) DO NOTHING
        `
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
