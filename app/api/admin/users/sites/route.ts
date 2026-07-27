import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Read-only companion to create-site/import-html/import-page — those all
// either resolve a site implicitly (resolveSiteId's "most recently touched"
// default) or require a siteId the caller already knows. This is for the
// case in between: finding which site(s) already exist on an account before
// deciding whether to create a new one or target an existing one explicitly.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const email = new URL(req.url).searchParams.get('email')
    if (!email?.trim()) {
      return NextResponse.json({ error: 'email query param is required' }, { status: 400 })
    }

    const userRows = (await sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string }[]
    const targetUser = userRows[0]
    if (!targetUser) {
      return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })
    }

    const sites = await sql`
      SELECT id, name, subdomain, custom_domain, domain_status, is_published, content_mode, updated_at
      FROM sites WHERE user_id = ${targetUser.id} ORDER BY updated_at DESC
    `

    return NextResponse.json({ ok: true, sites })
  } catch (err: any) {
    return errorResponse(err)
  }
}
