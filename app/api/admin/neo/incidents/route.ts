import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Read-only feed for the NEO admin dashboard. Same dual-auth as the
// assistant feed (session or BARIO_ADMIN_API_KEY, since it's read-only).
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const [open, recentResolved] = await Promise.all([
      sql`
        SELECT id, source, category, severity, description, status, action_taken, proposed_tool, proposed_args_json, proposed_label, last_seen_at, created_at
        FROM neo_incidents WHERE status IN ('detected', 'needs_review', 'pending_approval')
        ORDER BY status = 'pending_approval' DESC, severity = 'critical' DESC, last_seen_at DESC LIMIT 50
      `,
      sql`
        SELECT id, source, category, severity, description, status, action_taken, resolved_at, created_at
        FROM neo_incidents WHERE status IN ('resolved', 'auto_fixed')
        ORDER BY resolved_at DESC LIMIT 25
      `,
    ])

    return NextResponse.json({ open, recentResolved })
  } catch (err: any) {
    return errorResponse(err)
  }
}
