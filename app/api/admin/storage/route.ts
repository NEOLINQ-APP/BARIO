import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { put } from '@/lib/b2Storage'
import { requireAdmin } from '@/lib/admin'
import type { Asset } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

const MAX_SIZE = 100 * 1024 * 1024 // 100MB

function cleanFolder(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^\/+|\/+$/g, '')
}

// A simple Mega/S3-style file manager: folders are just path prefixes on the
// `folder` column (e.g. "templates/law-firm"), not a separate table — child
// folders at any level are derived from distinct prefixes on read.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  const folder = cleanFolder(new URL(req.url).searchParams.get('folder'))

  const [assets, allFolders] = await Promise.all([
    sql`SELECT * FROM assets WHERE folder = ${folder} ORDER BY created_at DESC` as unknown as Promise<Asset[]>,
    sql`SELECT DISTINCT folder FROM assets` as unknown as Promise<{ folder: string }[]>,
  ])

  const prefix = folder ? `${folder}/` : ''
  const childFolders = new Set<string>()
  for (const row of allFolders) {
    if (row.folder !== folder && row.folder.startsWith(prefix)) {
      const next = row.folder.slice(prefix.length).split('/')[0]
      if (next) childFolders.add(next)
    }
  }

  return NextResponse.json({ folder, folders: Array.from(childFolders).sort(), assets })
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql, user } = auth

  try {
    const form = await req.formData()
    const file = form.get('file')
    const folder = cleanFolder(form.get('folder') as string | null)
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be under 100MB' }, { status: 400 })
    }

    const pathname = folder ? `${folder}/${file.name}` : file.name
    const blob = await put(pathname, file, { access: 'public', addRandomSuffix: true })

    const id = randomUUID()
    await sql`
      INSERT INTO assets (id, folder, filename, url, content_type, size_bytes, uploaded_by)
      VALUES (${id}, ${folder}, ${file.name}, ${blob.url}, ${file.type || 'application/octet-stream'}, ${file.size}, ${user?.id ?? null})
    `

    return NextResponse.json({ ok: true, id, url: blob.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
