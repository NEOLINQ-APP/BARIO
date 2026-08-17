import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { put } from '@/lib/b2Storage'
import { errorResponse } from '@/lib/errors'
import type { StaffTd1Record } from '@/lib/db'

// Genuinely public, token-gated (not session-gated) — the person submitting
// this has no Bario account, they're a brand-new hire. The token itself,
// single-use (status flips to 'completed' immediately) and 14-day-expiring,
// is the access control.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const sql = await db()
    const rows = (await sql`SELECT * FROM staff_td1_records WHERE token = ${params.token}`) as unknown as StaffTd1Record[]
    const record = rows[0]
    if (!record) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
    if (record.status === 'completed') return NextResponse.json({ error: 'This form has already been submitted' }, { status: 400 })
    if (new Date(record.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'This link has expired' }, { status: 400 })

    const form = await req.formData()
    const federalPdf = form.get('federalPdf')
    const provincialPdf = form.get('provincialPdf')
    const federalTotalDollars = Number(form.get('federalTotalClaimDollars'))
    const provincialTotalDollars = Number(form.get('provincialTotalClaimDollars'))
    const signatureName = typeof form.get('signatureName') === 'string' ? (form.get('signatureName') as string).trim() : ''

    if (!(federalPdf instanceof File) || !(provincialPdf instanceof File)) {
      return NextResponse.json({ error: 'Both PDF files are required' }, { status: 400 })
    }
    if (federalPdf.type !== 'application/pdf' || provincialPdf.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Both files must be PDFs' }, { status: 400 })
    }
    if (!signatureName) return NextResponse.json({ error: 'signatureName is required' }, { status: 400 })
    if (!Number.isFinite(federalTotalDollars) || !Number.isFinite(provincialTotalDollars) || federalTotalDollars < 0 || provincialTotalDollars < 0) {
      return NextResponse.json({ error: 'Valid claim amounts are required' }, { status: 400 })
    }

    // NOTE: lib/b2Storage.ts only supports `access: 'public'` today — there
    // is no signed/private-download option yet. These PDFs contain real
    // SINs, so this relies on the storage key's random suffix being
    // unguessable, same security assumption as X-Drive files elsewhere in
    // this codebase — NOT true authenticated access control. Revisit if a
    // presigned-GET helper gets added to lib/b2Storage.ts.
    const federalBlob = await put(`staff-td1/${record.staff_id}/${record.id}/federal.pdf`, federalPdf, { access: 'public' })
    const provincialBlob = await put(`staff-td1/${record.staff_id}/${record.id}/provincial.pdf`, provincialPdf, { access: 'public' })

    const federalCents = Math.round(federalTotalDollars * 100)
    const provincialCents = Math.round(provincialTotalDollars * 100)
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    await sql`
      UPDATE staff_td1_records SET
        status = 'completed',
        federal_pdf_url = ${federalBlob.url},
        provincial_pdf_url = ${provincialBlob.url},
        federal_total_claim_cents = ${federalCents},
        provincial_total_claim_cents = ${provincialCents},
        signature_name = ${signatureName},
        signed_at = now(),
        signed_ip = ${ip}
      WHERE id = ${record.id}
    `

    // Feed straight into the real payroll withholding calc — no manual
    // re-entry by an admin required.
    await sql`
      UPDATE staff SET
        federal_claim_amount_cents = ${federalCents},
        provincial_claim_amount_cents = ${provincialCents}
      WHERE id = ${record.staff_id}
    `

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
