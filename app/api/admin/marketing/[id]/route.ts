import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { content } = await req.json()
    if (typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const rows = (await sql`SELECT status FROM marketing_posts WHERE id = ${params.id}`) as unknown as { status: string }[]
    if (!rows[0]) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (rows[0].status !== 'draft') {
      return NextResponse.json({ error: 'Only drafts can be edited' }, { status: 400 })
    }

    await sql`UPDATE marketing_posts SET content = ${content.trim()} WHERE id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  await sql`DELETE FROM marketing_posts WHERE id = ${params.id} AND status IN ('draft', 'rejected', 'failed')`
  return NextResponse.json({ ok: true })
}
