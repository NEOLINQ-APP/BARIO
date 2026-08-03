import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Partial-email lookup for the invoice share menu's "send to a Bario
// customer" picker — every other admin user route expects an exact email,
// which doesn't work for a search-as-you-type UI.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const q = new URL(req.url).searchParams.get('q')?.trim().toLowerCase() ?? ''
    if (q.length < 2) return NextResponse.json({ ok: true, users: [] })

    const rows = (await sql`
      SELECT id, email, plan FROM users WHERE email ILIKE ${'%' + q + '%'} ORDER BY email LIMIT 10
    `) as unknown as { id: string; email: string; plan: string | null }[]

    return NextResponse.json({ ok: true, users: rows })
  } catch (err) {
    return errorResponse(err)
  }
}
