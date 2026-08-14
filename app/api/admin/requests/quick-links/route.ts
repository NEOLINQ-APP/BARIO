import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import { logAdminAction } from '@/lib/adminActions'

// Admin-Bearer-gated CRUD for the client Requests portal's Quick Links
// (see client_quick_links in lib/db.ts) — one-click buttons like "Open Your
// CRM" shown to a specific client company (company_key from client_companies,
// e.g. 'afc_logistics' / 'sunbuilt_group').

export async function GET(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const links = await sql`
      SELECT id, company_key, label, url, sort_order, created_at FROM client_quick_links
      ORDER BY company_key ASC, sort_order ASC, created_at ASC
    `
    return NextResponse.json({ ok: true, links })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const { companyKey, label, url, sortOrder } = await req.json()
    if (!companyKey?.trim() || !label?.trim() || !url?.trim()) {
      return NextResponse.json({ error: 'companyKey, label, and url are required' }, { status: 400 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO client_quick_links (id, company_key, label, url, sort_order)
      VALUES (${id}, ${companyKey.trim()}, ${label.trim()}, ${url.trim()}, ${sortOrder ?? 0})
    `
    await logAdminAction(sql, { action: 'create_client_quick_link', result: 'ok', params: { companyKey, label, url } })

    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await sql`DELETE FROM client_quick_links WHERE id = ${id}`
    await logAdminAction(sql, { action: 'delete_client_quick_link', result: 'ok', params: { id } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
