import { NextResponse } from 'next/server'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { randomUUID } from 'node:crypto'
import { db, type BoOrganization } from '@/lib/db'
import { getCrmMailboxCreds } from '@/lib/barioOneCrmMailbox'
import { logAdminAction } from '@/lib/adminActions'

export const maxDuration = 60

// Polls every Bario One org's CRM mailbox (if one is provisioned) for
// unseen mail and files it into bo_notes as an inbound 'email' -- same
// exact IMAP-poll shape as app/api/cron/crm-outreach-replies (ImapFlow +
// mailparser, dedupe on Message-Id, mark \Seen after filing), just scoped
// per-org instead of per hardcoded outreach mailbox, and matching against
// bo_customers instead of crm_leadgen_drafted.
async function syncOrgMailbox(org: BoOrganization, sql: any) {
  const creds = getCrmMailboxCreds(org)
  if (!creds) return { synced: 0 }

  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: true,
    auth: { user: creds.email, pass: creds.password },
    logger: false,
  })

  let synced = 0
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
        const messageId = parsed.messageId || `${org.id}-${uid}`
        if (!fromEmail) {
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
          continue
        }

        const already = (await sql`SELECT 1 FROM bo_notes WHERE message_id = ${messageId}`) as unknown[]
        if (already.length > 0) {
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
          continue
        }

        // No customer match yet is filed anyway (customer_id can't be
        // null on bo_notes today, so an unmatched sender is skipped from
        // storage but still marked seen -- a future pass could relax
        // bo_notes.customer_id to nullable to keep these instead).
        const customerRows = (await sql`
          SELECT id FROM bo_customers WHERE organization_id = ${org.id} AND lower(email) = ${fromEmail} LIMIT 1
        `) as unknown as { id: string }[]
        const customerId = customerRows[0]?.id

        if (customerId) {
          const bodyText = parsed.text ?? ''
          // bo_notes_message_id_idx is a PARTIAL unique index (WHERE
          // message_id IS NOT NULL) -- Postgres only matches an ON CONFLICT
          // target against a partial index if the same predicate is
          // repeated here too, confirmed live: without it, this throws
          // "no unique or exclusion constraint matching the ON CONFLICT
          // specification" on every single insert attempt.
          await sql`
            INSERT INTO bo_notes (id, organization_id, customer_id, author_user_id, kind, body, direction, from_email, message_id)
            VALUES (${randomUUID()}, ${org.id}, ${customerId}, NULL, 'email', ${`Subject: ${parsed.subject ?? ''}\n\n${bodyText}`}, 'inbound', ${fromEmail}, ${messageId})
            ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING
          `
          synced++
        }

        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }
  return { synced }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()
  const orgs = (await sql`SELECT * FROM bo_organizations WHERE crm_mailbox_email IS NOT NULL`) as unknown as BoOrganization[]

  const results = []
  for (const org of orgs) {
    try {
      const { synced } = await syncOrgMailbox(org, sql)
      results.push({ orgId: org.id, org: org.name, synced })
    } catch (err: any) {
      results.push({ orgId: org.id, org: org.name, synced: 0, error: err.message })
    }
  }

  const totalSynced = results.reduce((n, r) => n + r.synced, 0)
  if (totalSynced > 0) {
    await logAdminAction(sql, { action: 'crm-email-sync-run', params: { results }, result: 'ok', triggeredBy: 'ai_autonomous' })
  }

  return NextResponse.json({ ok: true, results })
}
