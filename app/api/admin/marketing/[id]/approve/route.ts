import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import type { MarketingPost } from '@/lib/db'
import { publishPost } from '@/lib/marketing/publish'
import { errorResponse } from '@/lib/errors'

// Approval IS the publish trigger — there's no separate scheduler, so clicking
// "Approve" in the admin panel immediately posts to the real platform.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM marketing_posts WHERE id = ${params.id}`) as unknown as MarketingPost[]
    const post = rows[0]
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.status === 'posted') return NextResponse.json({ error: 'Already posted' }, { status: 400 })

    try {
      const externalId = await publishPost(post.platform, post.content)
      await sql`
        UPDATE marketing_posts SET status = 'posted', external_post_id = ${externalId}, posted_at = now(), error = NULL
        WHERE id = ${post.id}
      `
      return NextResponse.json({ ok: true, posted: true })
    } catch (publishErr: any) {
      await sql`UPDATE marketing_posts SET status = 'failed', error = ${publishErr.message} WHERE id = ${post.id}`
      return NextResponse.json({ error: publishErr.message }, { status: 502 })
    }
  } catch (err: any) {
    return errorResponse(err)
  }
}
