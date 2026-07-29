import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const status = new URL(req.url).searchParams.get('status')

    const rows = status
      ? await sql`
          SELECT v.*, u.email FROM vps_instances v
          JOIN users u ON u.id = v.user_id
          WHERE v.status = ${status}
          ORDER BY v.created_at DESC
        `
      : await sql`
          SELECT v.*, u.email FROM vps_instances v
          JOIN users u ON u.id = v.user_id
          ORDER BY v.created_at DESC
        `

    return NextResponse.json({ ok: true, instances: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
