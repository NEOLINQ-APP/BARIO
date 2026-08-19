import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { sendSms } from '@/lib/twilio'
import { rateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

const SHERWIN_NUMBER = '+17802410880'

// Public — no account needed. Captures interest from the "meet Victoria"
// (personal) or "AI Receptionist" (business) demo pages and texts Sherwin
// directly so he can follow up personally, rather than opening a fully
// public live call line before real abuse-prevention design exists for one.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const phoneNumber = typeof body?.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : null
    const product = body?.product === 'business' ? 'business' : 'personal'
    const companyName = typeof body?.companyName === 'string' ? body.companyName.trim().slice(0, 200) || null : null

    if (!name || name.length > 120) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!/^\+?[0-9()\-.\s]{7,20}$/.test(phoneNumber)) {
      return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 })
    }

    const sql = await db()
    const ipOk = await rateLimit(sql, `victoria-demo:ip:${clientIp(req)}`, 5, 60 * 60)
    if (!ipOk) return rateLimitResponse()

    const id = randomUUID()
    await sql`
      INSERT INTO victoria_demo_requests (id, name, phone_number, note, product, company_name)
      VALUES (${id}, ${name}, ${phoneNumber}, ${note}, ${product}, ${companyName})
    `

    const label = product === 'business' ? 'AI Receptionist' : 'Victoria'
    const companyPart = companyName ? ` for "${companyName}"` : ''
    const text = `New ${label} demo request: ${name} (${phoneNumber})${companyPart}${note ? ` — "${note}"` : ''}`
    await sendSms(SHERWIN_NUMBER, text).catch((err) => console.error('demo request SMS failed', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
