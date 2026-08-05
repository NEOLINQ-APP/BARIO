import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = await sql`
      SELECT id, tier, billing_cycle, app_type, region, hostname, primary_ipv4, primary_ipv6, status, backup_addon,
             root_password_ciphertext IS NOT NULL AS has_password_pending,
             wp_admin_user, wp_admin_password_ciphertext IS NOT NULL AS has_wp_password_pending,
             wp_domain, wp_cert_issued_at, created_at
      FROM vps_instances WHERE user_id = ${session.userId} ORDER BY created_at DESC
    `
    return NextResponse.json({ ok: true, instances: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
