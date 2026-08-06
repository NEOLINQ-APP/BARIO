import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { deprovisionWpSharedSite } from '@/lib/wpSharedProvision'
import { errorResponse } from '@/lib/errors'

// Escape hatch regardless of current status — mirrors
// app/api/admin/vps/force-delete/route.ts.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    await deprovisionWpSharedSite(sql, params.id)
    await logAdminAction(sql, { action: 'wp-hosting-site-force-delete', params: { id: params.id }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
