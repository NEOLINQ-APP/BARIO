import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasPaidPlan } from '@/lib/access'
import { dispatchSocialBlast } from '@/lib/social/dispatch'
import { isSocialPlatform } from '@/lib/social/platforms'
import { errorResponse } from '@/lib/errors'

// Meta's video processing poll alone can take up to ~2 minutes per
// platform (lib/social/meta.ts); platforms run concurrently via
// Promise.allSettled, but the route still needs headroom for the slowest
// one plus TikTok's own ~2-minute poll.
export const maxDuration = 150

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user || !hasPaidPlan(user)) {
    return NextResponse.json({ error: 'Upgrade to a paid plan to use the Social Dispatcher' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const caption = typeof body?.caption === 'string' ? body.caption.trim() : ''
    const mediaUrl = typeof body?.mediaUrl === 'string' && body.mediaUrl.trim() ? body.mediaUrl.trim() : null
    const mediaType = body?.mediaType === 'image' ? 'image' : 'video'
    const platforms = Array.isArray(body?.platforms) ? body.platforms.filter(isSocialPlatform) : []
    const isAdCampaign = body?.isAdCampaign === true
    const targetBudgetCents = typeof body?.targetBudgetCents === 'number' && body.targetBudgetCents > 0 ? Math.round(body.targetBudgetCents) : null

    if (!caption) return NextResponse.json({ error: 'Write a caption first' }, { status: 400 })
    if (!platforms.length) return NextResponse.json({ error: 'Select at least one platform' }, { status: 400 })

    const { id, results } = await dispatchSocialBlast(sql, session.userId, {
      caption,
      mediaUrl,
      mediaType,
      platforms,
      isAdCampaign,
      targetBudgetCents,
    })

    return NextResponse.json({ ok: true, id, results })
  } catch (err: any) {
    if (err.message?.includes('Paid ad campaigns')) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return errorResponse(err)
  }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const posts = await sql`SELECT * FROM social_posts WHERE user_id = ${session.userId} ORDER BY created_at DESC LIMIT 50`
  return NextResponse.json({ posts })
}
