import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// Lightweight session check for client components rendered outside the
// (account) dashboard chrome (e.g. GlobalMenuButton on /build, /admin, and
// marketing pages) — they can't call getSession() directly since they're
// client components, and don't want a server layout wrapping the whole site
// (that would force a DB round-trip on every anonymous marketing page load).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ loggedIn: false })

  const sql = await db()
  const userRows = (await sql`SELECT email, is_admin FROM users WHERE id = ${session.userId}`) as unknown as { email: string; is_admin: boolean }[]
  const user = userRows[0]
  if (!user) return NextResponse.json({ loggedIn: false })

  const clientCompanyRows = (await sql`SELECT company_label FROM client_companies WHERE user_id = ${session.userId}`) as unknown as { company_label: string }[]

  return NextResponse.json({
    loggedIn: true,
    email: user.email,
    isAdmin: user.is_admin,
    clientCompanyLabel: clientCompanyRows[0]?.company_label ?? null,
  })
}
