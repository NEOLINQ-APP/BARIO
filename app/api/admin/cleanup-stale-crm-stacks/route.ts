import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Throwaway cleanup route — safe to remove once run. The crm_stacks
// tracking table showed 5 "active" rows, but a direct check of the actual
// running Twenty instances (2026-08-20) found only 1 real live workspace
// across both remaining stacks, and zero real customer data in it (just
// Twenty's own default demo-seed contacts) -- these rows are stale
// metadata left over from provisioning that no longer has any underlying
// infrastructure at all (both stacks were fully removed this session).
// Marked 'deleted' rather than hard-deleted to preserve any historical
// linkage (e.g. Flo API key references) rather than risk breaking a
// foreign key I haven't traced everywhere.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const updated = await sql`
      UPDATE crm_stacks SET status = 'deleted', updated_at = now()
      WHERE status = 'active'
      RETURNING id, slug
    `
    await logAdminAction(sql, {
      action: 'crm_stacks_stale_cleanup',
      params: { markedDeleted: (updated as any[]).map((r: any) => r.slug) },
      result: 'ok',
    })
    return NextResponse.json({ ok: true, markedDeleted: updated })
  } catch (err) {
    return errorResponse(err)
  }
}
