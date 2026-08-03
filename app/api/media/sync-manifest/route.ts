import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/session'
import { db, type User, type MediaAsset } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { getEffectiveStorage } from '@/lib/mediaQuota'
import { errorResponse } from '@/lib/errors'

const PAGE_SIZE = 500

// The "what changed" endpoint the X-Drive desktop sync client polls,
// instead of walking every folder like the browser's GET /api/media does
// (that route is folder-scoped only). Returns every asset across every
// folder — the caller's own plus their family group's — updated at or
// after `since`, ordered so a client can keep advancing its own cursor
// (`nextSince`) across paginated calls without missing or double-counting
// rows that share the same updated_at instant.
export async function GET(req: Request) {
  try {
    const session = await getApiSession(req)
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the media library' }, { status: 403 })
    }

    const since = new URL(req.url).searchParams.get('since') ?? '1970-01-01T00:00:00.000Z'
    const storage = await getEffectiveStorage(sql, user)

    // Family groups are capped at 5 members — looping per member instead of
    // a single IN/ANY query avoids relying on this driver's array binding,
    // matching the same pattern GET /api/media already uses.
    // Strictly-greater-than, not >=: since nextSince below is itself the
    // last row's own updated_at, >= would re-return that same row forever.
    // Postgres timestamptz has microsecond precision, so two assets sharing
    // the exact same instant (and therefore one being skipped here) is not
    // a realistic risk at this scale.
    let assets: MediaAsset[] = []
    for (const id of storage.memberIds) {
      const rows = (await sql`
        SELECT * FROM media_assets WHERE user_id = ${id} AND updated_at > ${since}
        ORDER BY updated_at ASC LIMIT ${PAGE_SIZE}
      `) as unknown as MediaAsset[]
      assets = assets.concat(rows)
    }
    assets.sort((a, b) => (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : 0))
    const page = assets.slice(0, PAGE_SIZE)

    return NextResponse.json({
      ok: true,
      assets: page,
      hasMore: assets.length > PAGE_SIZE,
      nextSince: page.length ? page[page.length - 1].updated_at : since,
      tier: storage.tier,
      limitBytes: storage.limitBytes,
      usedBytes: storage.usedBytes,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
