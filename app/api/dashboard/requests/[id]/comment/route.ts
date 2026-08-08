import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/errors'
import { sendNewRequestAdminAlert } from '@/lib/email'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  try {
    const { message } = await req.json()
    if (!message?.trim()) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

    const sql = await db()
    const companyRows = (await sql`SELECT company_key, company_label FROM client_companies WHERE user_id = ${session.userId}`) as unknown as {
      company_key: string
      company_label: string
    }[]
    const company = companyRows[0]
    if (!company) return NextResponse.json({ error: 'Not a client account' }, { status: 403 })

    const requestRows = (await sql`SELECT id, title FROM client_requests WHERE id = ${params.id} AND company_key = ${company.company_key}`) as unknown as {
      id: string
      title: string
    }[]
    const request = requestRows[0]
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await sql`
      INSERT INTO client_request_events (id, request_id, actor, actor_label, event_type, message)
      VALUES (${randomUUID()}, ${params.id}, 'client', ${company.company_label}, 'comment', ${message.trim()})
    `
    await sql`UPDATE client_requests SET updated_at = now() WHERE id = ${params.id}`

    await sendNewRequestAdminAlert({ id: request.id, title: `Reply on: ${request.title}`, companyLabel: company.company_label, description: message.trim() })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
