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
      SELECT id, subdomain, custom_domain, domain_status, status,
             wp_admin_user, wp_admin_password_ciphertext IS NOT NULL AS has_password_pending,
             created_at
      FROM wp_sites WHERE user_id = ${session.userId} ORDER BY created_at DESC
    `
    return NextResponse.json({ ok: true, sites: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
