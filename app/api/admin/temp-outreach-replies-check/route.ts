import { NextResponse } from 'next/server'
import { ImapFlow } from 'imapflow'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// TEMP one-time diagnostic route: check the real AFC/Sunbuilt outreach
// mailboxes for any replies since the intro-outreach sends. Deleted after use.
async function checkInbox(user: string | undefined, pass: string | undefined) {
  if (!user || !pass) return { error: 'credentials not configured' }
  const client = new ImapFlow({ host: 'reseller.bario.ca', port: 993, secure: true, auth: { user, pass }, logger: false })
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const status = await client.status('INBOX', { messages: true, unseen: true })
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      const uids = await client.search({ since })
      const messages: { date: string; from: string; subject: string }[] = []
      if (uids && uids.length) {
        for await (const msg of client.fetch(uids, { envelope: true })) {
          if (!msg.envelope) continue
          messages.push({
            date: String(msg.envelope.date),
            from: msg.envelope.from?.[0]?.address || 'unknown',
            subject: msg.envelope.subject || '(no subject)',
          })
        }
      }
      return { totalMessages: status.messages, unseen: status.unseen, last14Days: messages.length, messages }
    } finally {
      lock.release()
    }
  } catch (err: any) {
    return { error: err.message }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const [afc, sunbuilt] = await Promise.all([
      checkInbox(process.env.AFC_OUTREACH_SMTP_USER, process.env.AFC_OUTREACH_SMTP_PASS),
      checkInbox(process.env.SUNBUILT_OUTREACH_SMTP_USER, process.env.SUNBUILT_OUTREACH_SMTP_PASS),
    ])
    return NextResponse.json({ ok: true, afc, sunbuilt })
  } catch (err: any) {
    return errorResponse(err)
  }
}
