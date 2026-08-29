import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// One-off diagnostic: why /api/domains/check is returning 'unknown' for
// every domain/TLD. Reproduces lib/rdap.ts's exact fetch call but surfaces
// the real status/error instead of silently collapsing to 'unknown'.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  const domain = new URL(req.url).searchParams.get('domain') ?? 'testexample123456.com'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  const started = Date.now()
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/rdap+json' },
    })
    const bodyText = await res.text().catch(() => '<could not read body>')
    return NextResponse.json({
      ok: true,
      domain,
      status: res.status,
      statusText: res.statusText,
      redirected: res.redirected,
      finalUrl: res.url,
      elapsedMs: Date.now() - started,
      bodyPreview: bodyText.slice(0, 300),
    })
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      domain,
      elapsedMs: Date.now() - started,
      errorName: err?.name,
      errorMessage: err?.message,
      errorCause: err?.cause ? String(err.cause) : null,
    })
  } finally {
    clearTimeout(timeout)
  }
}
