import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Read-only feed for the admin dashboard: recent complaints, recent admin
// actions (audit trail), and recent signups — the same data the assistant's
// tools can see, surfaced without needing to ask in chat. Accepts either
// admin session or the Bearer key like other /api/admin/* routes since it's
// read-only.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const [complaints, actions, signups] = await Promise.all([
      sql`SELECT id, email, subject, message, status, created_at FROM support_messages ORDER BY created_at DESC LIMIT 15`,
      sql`SELECT id, action, target_email, result, triggered_by, created_at FROM admin_actions_log ORDER BY created_at DESC LIMIT 15`,
      sql`SELECT email, plan, email_verified, created_at FROM users ORDER BY created_at DESC LIMIT 10`,
    ])

    return NextResponse.json({
      complaints,
      actions,
      signups,
      sentryConfigured: !!process.env.SENTRY_API_TOKEN,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
