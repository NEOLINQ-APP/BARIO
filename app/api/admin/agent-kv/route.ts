import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getSetting, setSetting } from '@/lib/platformSettings'
import { errorResponse } from '@/lib/errors'

// Shared scratch storage for AI coding agents (and admins) working on BARIO
// across machines/sessions — e.g. the current BARIO_ADMIN_API_KEY value, so
// a session that hits a stale key can read the latest one here instead of
// blindly rotating it (see CLAUDE.md's admin-key-rotation section). Reuses
// platform_settings under an "agent:" key prefix so it's trivially listable
// and never collides with real platform config keys. Gated by the same
// requireAdmin() as every other admin route (admin session OR the Bearer
// key itself) — deliberately not a general-purpose customer feature.
const PREFIX = 'agent:'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const url = new URL(req.url)
    const key = url.searchParams.get('key')

    if (key) {
      const value = await getSetting(sql, PREFIX + key)
      if (value === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ key, value })
    }

    const rows = (await sql`
      SELECT key, value, updated_at FROM platform_settings
      WHERE key LIKE ${PREFIX + '%'}
      ORDER BY updated_at DESC
    `) as unknown as { key: string; value: string; updated_at: string }[]

    return NextResponse.json({
      entries: rows.map((r) => ({ key: r.key.slice(PREFIX.length), value: r.value, updatedAt: r.updated_at })),
    })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { key, value } = await req.json()
    if (typeof key !== 'string' || !key.trim()) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }
    if (typeof value !== 'string') {
      return NextResponse.json({ error: 'value must be a string' }, { status: 400 })
    }

    await setSetting(sql, PREFIX + key.trim(), value)
    return NextResponse.json({ ok: true, key: key.trim() })
  } catch (err) {
    return errorResponse(err)
  }
}
