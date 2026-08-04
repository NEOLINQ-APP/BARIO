import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const leads = await sql`SELECT id, platform, full_name, email, phone, notified, created_at FROM social_leads WHERE user_id = ${session.userId} ORDER BY created_at DESC LIMIT 50`
  return NextResponse.json({ leads })
}
