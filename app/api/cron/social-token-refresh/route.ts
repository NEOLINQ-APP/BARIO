import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refreshAllSocialConnections } from '@/lib/social/tokenRefresh'

export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()
  const results = await refreshAllSocialConnections(sql)
  return NextResponse.json({ ok: true, results })
}
