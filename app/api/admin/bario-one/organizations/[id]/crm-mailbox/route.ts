import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { createMailbox, ensureDomain } from '@/lib/mailcow'
import { encryptPassword } from '@/lib/vpsPassword'
import { randomBytes } from 'node:crypto'
import type { BoOrganization } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Records (or auto-provisions) the real mailbox a Bario One org's CRM
// two-way email sync sends from and polls for replies. Two modes:
//
// 1. Bring-your-own mailbox (AFC/Sunbuilt's case -- crm@afclogistics.ca
//    and crm@sunbuiltgroup.com already exist on their own mail provider):
//    pass { email, imapHost, imapPort, smtpHost, smtpPort, password }
//    directly and this route just records the connection details.
// 2. Auto-provision (a future org with no mailbox of its own yet): pass
//    { autoProvision: true, domain } and this creates crm@<domain> on
//    Bario's own Mailcow server via the existing admin client
//    (lib/mailcow.ts), generating a random password.
//
// Either way the password is encrypted at rest (lib/vpsPassword.ts's
// existing AES-256-GCM helper, same one used for VPS root passwords) --
// never stored in plaintext.
const MAILCOW_HOST = 'reseller.bario.ca'
const MAILCOW_IMAP_PORT = 993
const MAILCOW_SMTP_PORT = 587

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin(req)
    if (auth instanceof NextResponse) return auth
    const { sql } = auth

    const existing = (await sql`SELECT * FROM bo_organizations WHERE id = ${params.id}`) as unknown as BoOrganization[]
    if (!existing[0]) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const body = await req.json()

    let email: string
    let imapHost: string
    let imapPort: number
    let smtpHost: string
    let smtpPort: number
    let password: string

    if (body.autoProvision) {
      const domain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : ''
      if (!domain) return NextResponse.json({ error: 'domain is required for autoProvision' }, { status: 400 })

      password = randomBytes(18).toString('base64url')
      await ensureDomain(domain)
      await createMailbox({ domain, localPart: 'crm', password, name: `${existing[0].name} CRM` })

      email = `crm@${domain}`
      imapHost = MAILCOW_HOST
      imapPort = MAILCOW_IMAP_PORT
      smtpHost = MAILCOW_HOST
      smtpPort = MAILCOW_SMTP_PORT
    } else {
      const { email: e, imapHost: ih, imapPort: ip, smtpHost: sh, smtpPort: sp, password: pw } = body
      if (typeof e !== 'string' || !e.includes('@')) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
      if (typeof ih !== 'string' || !ih.trim()) return NextResponse.json({ error: 'imapHost is required' }, { status: 400 })
      if (typeof sh !== 'string' || !sh.trim()) return NextResponse.json({ error: 'smtpHost is required' }, { status: 400 })
      if (typeof pw !== 'string' || !pw) return NextResponse.json({ error: 'password is required' }, { status: 400 })

      email = e.trim().toLowerCase()
      imapHost = ih.trim()
      imapPort = Number.isFinite(ip) ? ip : 993
      smtpHost = sh.trim()
      smtpPort = Number.isFinite(sp) ? sp : 587
      password = pw
    }

    const { ciphertext, iv } = encryptPassword(password)

    await sql`
      UPDATE bo_organizations SET
        crm_mailbox_email = ${email},
        crm_mailbox_imap_host = ${imapHost},
        crm_mailbox_imap_port = ${imapPort},
        crm_mailbox_smtp_host = ${smtpHost},
        crm_mailbox_smtp_port = ${smtpPort},
        crm_mailbox_password_ciphertext = ${ciphertext},
        crm_mailbox_password_iv = ${iv},
        updated_at = now()
      WHERE id = ${params.id}
    `

    await logAdminAction(sql, {
      action: 'bario_one_set_crm_mailbox',
      targetEmail: existing[0].name,
      params: { organizationId: params.id, email, autoProvisioned: Boolean(body.autoProvision) },
      result: 'ok',
    })

    return NextResponse.json({ ok: true, email })
  } catch (err: any) {
    return errorResponse(err)
  }
}
