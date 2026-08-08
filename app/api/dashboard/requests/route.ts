import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/errors'
import { estimateRequest } from '@/lib/requestEstimator'
import { sendRequestReceivedEmail, sendNewRequestAdminAlert } from '@/lib/email'

async function getClientCompany(sql: any, userId: string) {
  const rows = (await sql`SELECT company_key, company_label FROM client_companies WHERE user_id = ${userId}`) as unknown as {
    company_key: string
    company_label: string
  }[]
  return rows[0] || null
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  try {
    const sql = await db()
    const company = await getClientCompany(sql, session.userId)
    if (!company) return NextResponse.json({ error: 'Not a client account' }, { status: 403 })

    const requests = await sql`
      SELECT * FROM client_requests WHERE company_key = ${company.company_key} ORDER BY created_at DESC
    `
    return NextResponse.json({ ok: true, requests })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  try {
    const { title, description } = await req.json()
    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required' }, { status: 400 })
    }

    const sql = await db()
    const company = await getClientCompany(sql, session.userId)
    if (!company) return NextResponse.json({ error: 'Not a client account' }, { status: 403 })

    const userRows = (await sql`SELECT email FROM users WHERE id = ${session.userId}`) as unknown as { email: string }[]
    const email = userRows[0]?.email

    const id = randomUUID()
    await sql`
      INSERT INTO client_requests (id, company_key, user_id, title, description)
      VALUES (${id}, ${company.company_key}, ${session.userId}, ${title.trim()}, ${description.trim()})
    `
    await sql`
      INSERT INTO client_request_events (id, request_id, actor, actor_label, event_type, message)
      VALUES (${randomUUID()}, ${id}, 'client', ${company.company_label}, 'created', ${title.trim()})
    `

    await estimateRequest(sql, id)

    const rows = (await sql`SELECT * FROM client_requests WHERE id = ${id}`) as unknown as any[]
    const request = rows[0]

    if (email) {
      await sendRequestReceivedEmail(email, {
        title: request.title,
        companyLabel: company.company_label,
        estimatedCompletionAt: request.estimated_completion_at,
        estimateReasoning: request.estimate_reasoning,
      })
    }
    await sendNewRequestAdminAlert({ id, title: request.title, companyLabel: company.company_label, description: request.description })

    return NextResponse.json({ ok: true, request })
  } catch (err) {
    return errorResponse(err)
  }
}
