import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  await sql`UPDATE marketing_posts SET status = 'rejected' WHERE id = ${params.id} AND status = 'draft'`
  return NextResponse.json({ ok: true })
}
