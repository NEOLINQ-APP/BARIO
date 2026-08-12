import { NextResponse } from 'next/server'
import { put } from '@/lib/b2Storage'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasStudioAccess } from '@/lib/access'
import { ensureCreditsRefreshed, creditsForVoiceover } from '@/lib/credits'
import { runSync } from '@/lib/runpod'
import { rateLimit } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

export const maxDuration = 60
const MAX_CHARS = 2000

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasStudioAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use Studio' }, { status: 403 })
    }

    const { text, voiceId } = await req.json()
    if (typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }
    if (text.length > MAX_CHARS) {
      return NextResponse.json({ error: `Text must be under ${MAX_CHARS} characters` }, { status: 400 })
    }

    const allowed = await rateLimit(sql, `studio-voiceover:${user.id}`, 30, 3600)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many voiceovers this hour — please try again later.' }, { status: 429 })
    }

    const cost = user.is_admin ? 0 : creditsForVoiceover(text.length)
    if (!user.is_admin) {
      const creditsRemaining = await ensureCreditsRefreshed(sql, user)
      if (creditsRemaining < cost) {
        return NextResponse.json(
          { error: `This voiceover needs ${cost} credits but you have ${creditsRemaining}.` },
          { status: 403 }
        )
      }
    }

    const { outputBase64, outputContentType } = await runSync({ jobType: 'voiceover', text: text.trim(), voiceId })
    const contentType = outputContentType || 'audio/mpeg'
    const bytes = Buffer.from(outputBase64, 'base64')
    const blob = await put(`studio/${user.id}/${randomUUID()}.mp3`, bytes, { access: 'public', addRandomSuffix: true, contentType })

    if (cost > 0) {
      await sql`UPDATE users SET credits_remaining = credits_remaining - ${cost} WHERE id = ${user.id}`
    }

    return NextResponse.json({ ok: true, url: blob.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
