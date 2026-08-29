import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const url = new URL(req.url)
    const organizationId = url.searchParams.get('organizationId')
    const status = url.searchParams.get('status') ?? 'draft'

    const rows = organizationId
      ? await sql`
          SELECT id, organization_id, customer_id, customer_name, customer_email, reason, subject, body_html, status, created_at, sent_at
          FROM miko_followup_drafts WHERE organization_id = ${organizationId} AND status = ${status}
          ORDER BY created_at DESC LIMIT 100
        `
      : await sql`
          SELECT id, organization_id, customer_id, customer_name, customer_email, reason, subject, body_html, status, created_at, sent_at
          FROM miko_followup_drafts WHERE status = ${status}
          ORDER BY created_at DESC LIMIT 100
        `

    return NextResponse.json({ ok: true, drafts: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
