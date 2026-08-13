import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type SiteAudit } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`
      SELECT id, url, ai_report_json, status, created_at FROM site_audits
      WHERE user_id = ${session.userId}
      ORDER BY created_at DESC
      LIMIT 20
    `) as unknown as Pick<SiteAudit, 'id' | 'url' | 'ai_report_json' | 'status' | 'created_at'>[]

    return NextResponse.json({
      audits: rows.map((r) => ({
        id: r.id,
        url: r.url,
        status: r.status,
        createdAt: r.created_at,
        score: r.ai_report_json ? JSON.parse(r.ai_report_json).score : null,
      })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
