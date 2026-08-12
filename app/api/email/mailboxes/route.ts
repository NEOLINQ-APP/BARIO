import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasPaidPlan } from '@/lib/access'
import { createDnsRecord } from '@/lib/cloudflare'
import { ensureDomain, createMailbox, getDkim, deleteMailbox } from '@/lib/mailcow'
import { errorResponse } from '@/lib/errors'

// A brand-new domain's ensureDomain() call now also restarts sogo-mailcow
// over SSH (see lib/mailcow.ts) so its webmail login works immediately
// instead of silently breaking until someone restarts it by hand — that
// restart alone takes ~10-15s, so the default function timeout isn't enough.
export const maxDuration = 60

const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = await sql`
      SELECT id, site_id, domain, local_part, full_address, quota_mb, status, created_at
      FROM email_mailboxes WHERE user_id = ${session.userId} ORDER BY created_at DESC
    `
    return NextResponse.json({ ok: true, mailboxes: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasPaidPlan(user)) {
      return NextResponse.json({ error: 'Upgrade to a paid plan to use custom email' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const siteId = typeof body?.siteId === 'string' ? body.siteId : null
    const localPart = String(body?.localPart ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')

    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 })
    if (!LOCAL_PART_RE.test(localPart)) {
      return NextResponse.json({ error: 'Enter a valid mailbox name, e.g. info or sales' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const siteRows = (await sql`
      SELECT id, user_id, custom_domain, domain_status, cloudflare_zone_id FROM sites WHERE id = ${siteId}
    `) as unknown as { id: string; user_id: string; custom_domain: string | null; domain_status: string; cloudflare_zone_id: string | null }[]
    const site = siteRows[0]
    if (!site || site.user_id !== session.userId) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    }
    if (!site.custom_domain || site.domain_status !== 'verified') {
      return NextResponse.json({ error: 'Connect and verify a custom domain on this site before adding email' }, { status: 400 })
    }

    const domain = site.custom_domain
    const fullAddress = `${localPart}@${domain}`

    const existingRows = (await sql`SELECT id FROM email_mailboxes WHERE full_address = ${fullAddress}`) as unknown as { id: string }[]
    if (existingRows[0]) {
      return NextResponse.json({ error: `${fullAddress} already exists` }, { status: 409 })
    }

    const domainMailboxRows = (await sql`SELECT id FROM email_mailboxes WHERE domain = ${domain} LIMIT 1`) as unknown as { id: string }[]
    const isFirstMailboxOnDomain = !domainMailboxRows[0]

    await ensureDomain(domain)
    await createMailbox({ domain, localPart, password, name: localPart })

    let mxRecordId: string | null = null
    let spfRecordId: string | null = null
    let dkimRecordId: string | null = null

    // DNS only needs setting up once per domain, the first time a mailbox
    // is created on it — every mailbox after that shares the same MX/SPF/
    // DKIM records. Best-effort: a mailbox is still usable via webmail
    // even if a customer's zone isn't Cloudflare-managed (DNS just has to
    // be added manually in that case, surfaced in the response below).
    if (isFirstMailboxOnDomain && site.cloudflare_zone_id) {
      try {
        const mx = await createDnsRecord(site.cloudflare_zone_id, { type: 'MX', name: '@', content: 'reseller.bario.ca', priority: 10 })
        mxRecordId = mx.id
        const spf = await createDnsRecord(site.cloudflare_zone_id, { type: 'TXT', name: '@', content: 'v=spf1 mx ~all' })
        spfRecordId = spf.id
        const dkim = await getDkim(domain)
        const dkimRecord = await createDnsRecord(site.cloudflare_zone_id, {
          type: 'TXT',
          name: `${dkim.dkim_selector}._domainkey`,
          content: dkim.dkim_txt,
        })
        dkimRecordId = dkimRecord.id
      } catch {
        // Non-fatal — the mailbox itself was already created successfully
        // in Mailcow; DNS can be added manually if this fails.
      }
    }

    const id = randomUUID()
    await sql`
      INSERT INTO email_mailboxes (id, user_id, site_id, domain, local_part, full_address, mx_record_id, spf_record_id, dkim_record_id)
      VALUES (${id}, ${session.userId}, ${site.id}, ${domain}, ${localPart}, ${fullAddress}, ${mxRecordId}, ${spfRecordId}, ${dkimRecordId})
    `

    return NextResponse.json({
      ok: true,
      id,
      fullAddress,
      dnsAutoConfigured: isFirstMailboxOnDomain ? Boolean(mxRecordId) : true,
      webmailUrl: 'https://reseller.bario.ca/SOGo',
      imap: { host: 'reseller.bario.ca', port: 993, security: 'SSL/TLS' },
      smtp: { host: 'reseller.bario.ca', port: 587, security: 'STARTTLS' },
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { id } = await req.json().catch(() => ({}))
    if (typeof id !== 'string') return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM email_mailboxes WHERE id = ${id}`) as unknown as { id: string; user_id: string; full_address: string }[]
    const mailbox = rows[0]
    if (!mailbox || mailbox.user_id !== session.userId) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })
    }

    // Deletes the mailbox itself but deliberately leaves the domain-wide
    // MX/SPF/DKIM records and Mailcow domain object in place — other
    // mailboxes on the same domain may still depend on them, and stale
    // DNS pointing at a mail server with no mailboxes behind it is
    // harmless (it just bounces mail), unlike breaking working ones.
    await deleteMailbox(mailbox.full_address)
    await sql`DELETE FROM email_mailboxes WHERE id = ${id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
