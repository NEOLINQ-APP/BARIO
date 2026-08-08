import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  try {
    const sql = await db()
    const companyRows = (await sql`SELECT company_key FROM client_companies WHERE user_id = ${session.userId}`) as unknown as { company_key: string }[]
    const company = companyRows[0]
    if (!company) return NextResponse.json({ error: 'Not a client account' }, { status: 403 })

    const requestRows = (await sql`SELECT * FROM client_requests WHERE id = ${params.id} AND company_key = ${company.company_key}`) as unknown as any[]
    const request = requestRows[0]
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const events = await sql`SELECT * FROM client_request_events WHERE request_id = ${params.id} ORDER BY created_at ASC`
    return NextResponse.json({ ok: true, request, events })
  } catch (err) {
    return errorResponse(err)
  }
}
