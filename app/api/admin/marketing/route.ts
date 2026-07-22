import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import type { MarketingPost } from '@/lib/db'
import { ALL_PLATFORMS, isPlatformConnected } from '@/lib/marketing/platforms'
import { generateDrafts } from '@/lib/marketing/generate'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  const posts = (await sql`SELECT * FROM marketing_posts ORDER BY created_at DESC LIMIT 100`) as unknown as MarketingPost[]
  const connected = Object.fromEntries(ALL_PLATFORMS.map((p) => [p, isPlatformConnected(p)]))
  return NextResponse.json({ posts, connected })
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { user, sql } = auth

  try {
    const { platforms, topic } = await req.json()
    const selected = Array.isArray(platforms) && platforms.length ? platforms.filter((p: string) => ALL_PLATFORMS.includes(p as any)) : ALL_PLATFORMS
    if (!selected.length) {
      return NextResponse.json({ error: 'No valid platforms selected' }, { status: 400 })
    }
    const cleanTopic = typeof topic === 'string' && topic.trim() ? topic.trim() : 'promoting Bario to Canadian small business owners'

    const drafts = await generateDrafts(selected, cleanTopic)
    if (!drafts.length) {
      return NextResponse.json({ error: 'The AI did not return any drafts — try again' }, { status: 502 })
    }

    for (const draft of drafts) {
      await sql`
        INSERT INTO marketing_posts (id, platform, content, status, created_by)
        VALUES (${randomUUID()}, ${draft.platform}, ${draft.content}, 'draft', ${user.id})
      `
    }

    return NextResponse.json({ ok: true, count: drafts.length })
  } catch (err: any) {
    return errorResponse(err)
  }
}
