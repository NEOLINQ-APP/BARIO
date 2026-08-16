import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

const PAGE_SIZE = 50

// "Live" = has at least one published site — the real signal for "actually
// using bario.ca," not just "has an account." last_activity is the most
// recent sites.updated_at across all their sites (published or not), a
// reasonable proxy for "last touched the builder" since there's no
// dedicated activity-log table.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase() ?? ''
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const offset = (page - 1) * PAGE_SIZE

    const countRows = q
      ? ((await sql`SELECT count(*)::int AS count FROM users WHERE email ILIKE ${'%' + q + '%'}`) as unknown as { count: number }[])
      : ((await sql`SELECT count(*)::int AS count FROM users`) as unknown as { count: number }[])
    const total = countRows[0]?.count ?? 0

    const rows = q
      ? await sql`
          SELECT
            u.id, u.email, u.plan, u.subscription_status, u.is_admin, u.email_verified, u.suspended_at, u.admin_note, u.created_at,
            COALESCE(s.site_count, 0)::int AS site_count,
            COALESCE(s.published_count, 0)::int AS published_count,
            s.last_activity
          FROM users u
          LEFT JOIN (
            SELECT user_id, count(*)::int AS site_count, count(*) FILTER (WHERE is_published) AS published_count, max(updated_at) AS last_activity
            FROM sites GROUP BY user_id
          ) s ON s.user_id = u.id
          WHERE u.email ILIKE ${'%' + q + '%'}
          ORDER BY u.created_at DESC
          LIMIT ${PAGE_SIZE} OFFSET ${offset}
        `
      : await sql`
          SELECT
            u.id, u.email, u.plan, u.subscription_status, u.is_admin, u.email_verified, u.suspended_at, u.admin_note, u.created_at,
            COALESCE(s.site_count, 0)::int AS site_count,
            COALESCE(s.published_count, 0)::int AS published_count,
            s.last_activity
          FROM users u
          LEFT JOIN (
            SELECT user_id, count(*)::int AS site_count, count(*) FILTER (WHERE is_published) AS published_count, max(updated_at) AS last_activity
            FROM sites GROUP BY user_id
          ) s ON s.user_id = u.id
          ORDER BY u.created_at DESC
          LIMIT ${PAGE_SIZE} OFFSET ${offset}
        `

    return NextResponse.json({ ok: true, users: rows, total, page, pageSize: PAGE_SIZE })
  } catch (err) {
    return errorResponse(err)
  }
}
