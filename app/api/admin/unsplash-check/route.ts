import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// One-off diagnostic (2026-08-21) — searchImage() in lib/unsplash.ts
// silently returns null on ANY failure (missing key, bad response, network
// error) with zero logging, so a real Unsplash outage/rate-limit/invalid
// key has been invisible — every image on every generated site quietly
// falls back to a placehold.co box instead. This surfaces the real cause.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'UNSPLASH_ACCESS_KEY not configured' })

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=modern+office&per_page=1`,
      { headers: { Authorization: `Client-ID ${key}` } }
    )
    const rateLimit = res.headers.get('x-ratelimit-limit')
    const rateRemaining = res.headers.get('x-ratelimit-remaining')
    const body = await res.text()
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      rateLimit,
      rateRemaining,
      bodyPreview: body.slice(0, 500),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
