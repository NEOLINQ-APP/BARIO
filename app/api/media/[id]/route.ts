import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { getSession } from '@/lib/session'
import { db, type User, type MediaAsset } from '@/lib/db'
import { getEffectiveStorage } from '@/lib/mediaQuota'
import { errorResponse } from '@/lib/errors'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const rows = (await sql`SELECT * FROM media_assets WHERE id = ${params.id}`) as unknown as MediaAsset[]
    const asset = rows[0]
    if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Any family member can delete a shared file, not just whoever uploaded
    // it — same as any real shared drive.
    const storage = await getEffectiveStorage(sql, user)
    if (!storage.memberIds.includes(asset.user_id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await del(asset.url).catch(() => {})
    await sql`DELETE FROM media_assets WHERE id = ${params.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
