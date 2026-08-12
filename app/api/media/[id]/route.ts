import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { del } from '@/lib/b2Storage'
import { getSession } from '@/lib/session'
import { db, type User, type MediaAsset } from '@/lib/db'
import { getEffectiveStorage } from '@/lib/mediaQuota'
import { errorResponse } from '@/lib/errors'

function cleanFolder(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^\/+|\/+$/g, '')
}

// Loads the asset and confirms the caller is allowed to touch it (any
// family member can manage a shared file, not just whoever uploaded it —
// same rule DELETE already used).
async function loadOwnedAsset(sql: any, user: User, id: string): Promise<MediaAsset | null> {
  const rows = (await sql`SELECT * FROM media_assets WHERE id = ${id}`) as unknown as MediaAsset[]
  const asset = rows[0]
  if (!asset) return null
  const storage = await getEffectiveStorage(sql, user)
  if (!storage.memberIds.includes(asset.user_id)) return null
  return asset
}

// Rename and/or move a file (change filename and/or folder) — no blob
// re-upload needed, this only touches the metadata row.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const asset = await loadOwnedAsset(sql, user, params.id)
    if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const newFilename = typeof body?.filename === 'string' ? body.filename.trim() : null
    const newFolder = typeof body?.folder === 'string' ? cleanFolder(body.folder) : null

    if (!newFilename && newFolder === null) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }
    if (newFilename === '') {
      return NextResponse.json({ error: 'Filename cannot be empty' }, { status: 400 })
    }

    await sql`
      UPDATE media_assets
      SET filename = ${newFilename || asset.filename}, folder = ${newFolder !== null ? newFolder : asset.folder}
      WHERE id = ${params.id}
    `

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Duplicates a file's metadata row (pointing at the same underlying blob —
// files are immutable once uploaded, so a "copy" is just a second reference
// to the same bytes, not a physical re-upload) into a target folder.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const asset = await loadOwnedAsset(sql, user, params.id)
    if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // A copy is still accounted as real storage used (same convention as
    // Google Drive's "Make a copy") — otherwise a user could duplicate a
    // large file indefinitely for free instead of it counting against
    // their plan.
    const storage = await getEffectiveStorage(sql, user)
    if (storage.usedBytes + asset.size_bytes > storage.limitBytes) {
      return NextResponse.json(
        { error: 'That would put you over your storage limit. Upgrade your plan for more space.', overQuota: true },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const targetFolder = typeof body?.folder === 'string' ? cleanFolder(body.folder) : asset.folder

    const newId = randomUUID()
    await sql`
      INSERT INTO media_assets (id, user_id, folder, filename, url, content_type, size_bytes, encrypted, iv)
      VALUES (${newId}, ${asset.user_id}, ${targetFolder}, ${asset.filename}, ${asset.url}, ${asset.content_type}, ${asset.size_bytes}, ${asset.encrypted}, ${asset.iv})
    `

    return NextResponse.json({ ok: true, id: newId })
  } catch (err: any) {
    return errorResponse(err)
  }
}

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
