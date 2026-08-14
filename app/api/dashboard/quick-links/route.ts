import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  try {
    const sql = await db()
    const companyRows = (await sql`SELECT company_key FROM client_companies WHERE user_id = ${session.userId}`) as unknown as {
      company_key: string
    }[]
    const company = companyRows[0]
    if (!company) return NextResponse.json({ error: 'Not a client account' }, { status: 403 })

    const links = await sql`
      SELECT id, label, url FROM client_quick_links
      WHERE company_key = ${company.company_key}
      ORDER BY sort_order ASC, created_at ASC
    `
    return NextResponse.json({ ok: true, links })
  } catch (err) {
    return errorResponse(err)
  }
}