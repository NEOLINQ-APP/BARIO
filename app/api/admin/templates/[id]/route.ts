import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  await sql`DELETE FROM templates WHERE id = ${params.id}`
  return NextResponse.json({ ok: true })
}
