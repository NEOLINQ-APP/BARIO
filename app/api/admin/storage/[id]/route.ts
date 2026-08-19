import { NextResponse } from 'next/server'
import { del } from '@/lib/storage'
import { requireAdmin } from '@/lib/admin'
import type { Asset } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM assets WHERE id = ${params.id}`) as unknown as Asset[]
    const asset = rows[0]
    if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await del(asset.url).catch(() => {})
    await sql`DELETE FROM assets WHERE id = ${params.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
