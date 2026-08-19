import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { submitCareersApplication } from '@/lib/barioOneCareers'
import { errorResponse } from '@/lib/errors'

// Genuinely public, unauthenticated — the real submit target for the
// /careers page's application form. Rate-limited per IP same as
// app/api/public/site-lead, since there's no session to gate on.
export async function POST(req: Request) {
  try {
    const sql = await db()
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const allowed = await rateLimit(sql, `careers-app:${ip}`, 5, 3600)
    if (!allowed) return NextResponse.json({ error: 'Too many requests -- try again later' }, { status: 429 })

    const body = await req.json().catch(() => ({}))
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : ''
    const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 200) : ''
    const phone = typeof body?.phone === 'string' && body.phone.trim() ? body.phone.trim().slice(0, 40) : null
    const roleInterest = typeof body?.roleInterest === 'string' && body.roleInterest.trim() ? body.roleInterest.trim().slice(0, 200) : null
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 3000) : ''
    const resumeLink = typeof body?.resumeLink === 'string' && body.resumeLink.trim() ? body.resumeLink.trim().slice(0, 500) : null

    if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'A valid name and email are required' }, { status: 400 })
    }
    if (!message) {
      return NextResponse.json({ error: 'Tell us a bit about yourself/what you\'d want to work on' }, { status: 400 })
    }

    await submitCareersApplication({ name, email, phone, roleInterest, message, resumeLink })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
