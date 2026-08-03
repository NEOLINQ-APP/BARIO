import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { put } from '@vercel/blob'
import { getSession } from '@/lib/session'
import { db, type User, type MediaAsset } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { getEffectiveStorage } from '@/lib/mediaQuota'
import { errorResponse } from '@/lib/errors'

function cleanFolder(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^\/+|\/+$/g, '')
}

async function loadUser(sql: any, userId: string): Promise<User | null> {
  const rows = (await sql`SELECT * FROM users WHERE id = ${userId}`) as unknown as User[]
  return rows[0] ?? null
}

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const user = await loadUser(sql, session.userId)
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the media library' }, { status: 403 })
    }

    const folder = cleanFolder(new URL(req.url).searchParams.get('folder'))
    const storage = await getEffectiveStorage(sql, user)

    // Family groups are capped at 5 members — looping per member instead of
    // a single IN/ANY query avoids relying on this driver's array binding.
    let assets: MediaAsset[] = []
    let allFolders: { folder: string }[] = []
    for (const id of storage.memberIds) {
      const [a, f] = await Promise.all([
        sql`SELECT * FROM media_assets WHERE folder = ${folder} AND user_id = ${id} ORDER BY created_at DESC` as unknown as Promise<MediaAsset[]>,
        sql`SELECT DISTINCT folder FROM media_assets WHERE user_id = ${id}` as unknown as Promise<{ folder: string }[]>,
      ])
      assets = assets.concat(a)
      allFolders = allFolders.concat(f)
    }
    assets.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

    const prefix = folder ? `${folder}/` : ''
    const childFolders = new Set<string>()
    for (const row of allFolders) {
      if (row.folder !== folder && row.folder.startsWith(prefix)) {
        const next = row.folder.slice(prefix.length).split('/')[0]
        if (next) childFolders.add(next)
      }
    }

    return NextResponse.json({
      folder,
      folders: Array.from(childFolders).sort(),
      assets,
      tier: storage.tier,
      limitBytes: storage.limitBytes,
      usedBytes: storage.usedBytes,
      isFamilyMember: storage.memberIds.length > 1,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

const MAX_SIZE = 200 * 1024 * 1024 // 200MB per file — generous for a single photo/video

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const user = await loadUser(sql, session.userId)
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the media library' }, { status: 403 })
    }

    const form = await req.formData()
    const file = form.get('file')
    const folder = cleanFolder(form.get('folder') as string | null)
    // Set when the file bytes are already client-side AES-GCM ciphertext
    // (lib/e2eCrypto.ts encryptFile) — contentType then carries the REAL
    // mime type for rendering post-decrypt, since file.type on an encrypted
    // blob is just 'application/octet-stream'.
    const encrypted = form.get('encrypted') === 'true'
    const iv = form.get('iv') as string | null
    const contentTypeOverride = form.get('contentType')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (encrypted && typeof iv !== 'string') {
      return NextResponse.json({ error: 'iv is required for an encrypted upload' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be under 200MB' }, { status: 400 })
    }

    const storage = await getEffectiveStorage(sql, user)
    if (storage.usedBytes + file.size > storage.limitBytes) {
      return NextResponse.json(
        { error: `That would put you over your storage limit. Upgrade your plan for more space.`, overQuota: true },
        { status: 403 }
      )
    }

    const pathname = folder ? `${folder}/${file.name}` : file.name
    const blob = await put(`media/${user.id}/${pathname}`, file, { access: 'public', addRandomSuffix: true })

    const contentType = encrypted && typeof contentTypeOverride === 'string' ? contentTypeOverride : file.type

    const id = randomUUID()
    await sql`
      INSERT INTO media_assets (id, user_id, folder, filename, url, content_type, size_bytes, encrypted, iv)
      VALUES (${id}, ${user.id}, ${folder}, ${file.name}, ${blob.url}, ${contentType}, ${file.size}, ${encrypted}, ${encrypted ? iv : null})
    `

    return NextResponse.json({ ok: true, id, url: blob.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
