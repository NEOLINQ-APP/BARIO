import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { addAuxiliaryMailAccount, removeAuxiliaryMailAccount } from '@/lib/sogoAuxAccounts'
import { errorResponse } from '@/lib/errors'

// Each add/remove restarts sogo-mailcow (~10-15s) so SOGo actually picks up
// the direct database write -- see the comment in lib/sogoAuxAccounts.ts.
export const maxDuration = 60

const MAX_EXTERNAL_ACCOUNTS_PER_USER = 5
const TRIAL_DURATION_MS = 365 * 24 * 60 * 60 * 1000 // 1 year

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = await sql`
      SELECT id, mailbox_id, label, email, created_at FROM email_external_accounts
      WHERE user_id = ${session.userId} ORDER BY created_at ASC
    `
    const trialStartedAt = (rows as any[])[0]?.created_at ?? null
    const trialEndsAt = trialStartedAt ? new Date(new Date(trialStartedAt).getTime() + TRIAL_DURATION_MS).toISOString() : null

    return NextResponse.json({
      ok: true,
      accounts: rows,
      limit: MAX_EXTERNAL_ACCOUNTS_PER_USER,
      trialEndsAt,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const body = await req.json().catch(() => ({}))
    const mailboxId = String(body?.mailboxId ?? '')
    const label = String(body?.label ?? '').trim()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const imapHost = String(body?.imapHost ?? '').trim()
    const imapPort = Number(body?.imapPort)
    const smtpHost = String(body?.smtpHost ?? '').trim()
    const smtpPort = Number(body?.smtpPort)
    const password = String(body?.password ?? '')

    if (!mailboxId) return NextResponse.json({ error: 'mailboxId is required' }, { status: 400 })
    if (!label) return NextResponse.json({ error: 'A label is required' }, { status: 400 })
    if (!email.includes('@')) return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
    if (!imapHost || !Number.isFinite(imapPort)) return NextResponse.json({ error: 'IMAP host and port are required' }, { status: 400 })
    if (!smtpHost || !Number.isFinite(smtpPort)) return NextResponse.json({ error: 'SMTP host and port are required' }, { status: 400 })
    if (!password) return NextResponse.json({ error: 'Password is required' }, { status: 400 })

    const mailboxRows = (await sql`
      SELECT id, user_id, full_address FROM email_mailboxes WHERE id = ${mailboxId}
    `) as unknown as { id: string; user_id: string; full_address: string }[]
    const mailbox = mailboxRows[0]
    if (!mailbox || mailbox.user_id !== session.userId) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })
    }

    const existing = (await sql`
      SELECT id, created_at FROM email_external_accounts WHERE user_id = ${session.userId} ORDER BY created_at ASC
    `) as unknown as { id: string; created_at: string }[]

    if (existing.length >= MAX_EXTERNAL_ACCOUNTS_PER_USER) {
      return NextResponse.json({ error: `You can connect up to ${MAX_EXTERNAL_ACCOUNTS_PER_USER} external mailboxes` }, { status: 403 })
    }
    const trialStartedAt = existing[0]?.created_at
    if (trialStartedAt && Date.now() > new Date(trialStartedAt).getTime() + TRIAL_DURATION_MS) {
      return NextResponse.json({ error: 'Your free year of connected external mailboxes has ended' }, { status: 403 })
    }

    const sogoAccountId = await addAuxiliaryMailAccount(mailbox.full_address, {
      label,
      email,
      imapHost,
      imapPort,
      smtpHost,
      smtpPort,
      password,
    })

    const id = randomUUID()
    await sql`
      INSERT INTO email_external_accounts (id, user_id, mailbox_id, label, email, sogo_account_id)
      VALUES (${id}, ${session.userId}, ${mailbox.id}, ${label}, ${email}, ${sogoAccountId})
    `

    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const { id } = await req.json().catch(() => ({}))
    if (typeof id !== 'string') return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const rows = (await sql`
      SELECT ea.id, ea.user_id, ea.sogo_account_id, m.full_address
      FROM email_external_accounts ea
      JOIN email_mailboxes m ON m.id = ea.mailbox_id
      WHERE ea.id = ${id}
    `) as unknown as { id: string; user_id: string; sogo_account_id: number; full_address: string }[]
    const account = rows[0]
    if (!account || account.user_id !== session.userId) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    await removeAuxiliaryMailAccount(account.full_address, account.sogo_account_id)
    await sql`DELETE FROM email_external_accounts WHERE id = ${id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
