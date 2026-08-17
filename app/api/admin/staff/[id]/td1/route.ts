import { NextResponse } from 'next/server'
import { randomUUID, randomBytes } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { sendEmail } from '@/lib/email'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'
import type { Staff } from '@/lib/db'

// Creates a token-gated TD1 (federal + provincial) intake link for a staff
// member — no Bario login involved, since a brand-new hire has no account
// yet. Emails it automatically if the staff row has an email on file;
// either way the link is returned so it can be sent manually too.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM staff WHERE id = ${params.id}`) as unknown as Staff[]
    const staff = rows[0]
    if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

    if (staff.province !== 'AB') {
      return NextResponse.json({ error: 'Digital TD1 intake currently only supports Alberta (the only province with a verified TD1 form mapping) — send other provinces’ forms manually for now.' }, { status: 400 })
    }

    const token = randomBytes(24).toString('hex')
    const id = randomUUID()
    const taxYear = new Date().getFullYear()
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

    await sql`
      INSERT INTO staff_td1_records (id, staff_id, token, province, tax_year, status, expires_at)
      VALUES (${id}, ${staff.id}, ${token}, ${staff.province}, ${taxYear}, 'pending', ${expiresAt})
    `

    const origin = req.headers.get('origin') ?? 'https://www.bario.ca'
    const link = `${origin}/staff-td1/${token}`

    let emailed = false
    if (staff.email) {
      try {
        await sendEmail(
          staff.email,
          'Please complete your tax forms (TD1) for payroll',
          `<p>Hi ${staff.name},</p>
           <p>Welcome aboard! Before your first paycheque, Canadian payroll law requires us to have a completed and signed federal and Alberta TD1 (Personal Tax Credits Return) on file for you.</p>
           <p>Please use the secure link below to download both forms, fill them out, sign them, and upload them back to us — it takes a few minutes:</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 14 days. If you have any questions, just reply to this email.</p>`
        )
        emailed = true
      } catch (err) {
        console.error('Failed to send TD1 invite email', err)
      }
    }

    await logAdminAction(sql, { action: 'staff-td1-invite-sent', params: { staffId: staff.id, emailed }, result: 'ok' })

    return NextResponse.json({ ok: true, link, expiresAt, emailed })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const records = await sql`SELECT * FROM staff_td1_records WHERE staff_id = ${params.id} ORDER BY created_at DESC`
    return NextResponse.json({ ok: true, records })
  } catch (err) {
    return errorResponse(err)
  }
}
