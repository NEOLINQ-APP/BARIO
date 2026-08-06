import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type WpSite } from '@/lib/db'
import { decryptPassword } from '@/lib/vpsPassword'
import { errorResponse } from '@/lib/errors'

// One-time reveal, same nulls-after-read pattern as vps reveal-password.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM wp_sites WHERE id = ${params.id} AND user_id = ${session.userId}`) as unknown as WpSite[]
    const site = rows[0]
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    if (!site.wp_admin_password_ciphertext || !site.wp_admin_password_iv) {
      return NextResponse.json({ error: 'No password available — it may have already been revealed.' }, { status: 400 })
    }

    const password = decryptPassword(site.wp_admin_password_ciphertext, site.wp_admin_password_iv)
    await sql`
      UPDATE wp_sites SET wp_admin_password_ciphertext = NULL, wp_admin_password_iv = NULL, wp_admin_password_revealed_at = now(), updated_at = now()
      WHERE id = ${params.id}
    `

    return NextResponse.json({ ok: true, username: site.wp_admin_user, password })
  } catch (err: any) {
    return errorResponse(err)
  }
}
