import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { put } from '@/lib/b2Storage'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Admin equivalent of POST /api/media — uploads a file into a customer's
// X-Drive on their behalf (e.g. re-hosting images pulled out of an external
// site export, like /api/admin/users/import-page's HTML). Skips the
// session/hasBuilderAccess gate but keeps the same media_assets row shape,
// so the file shows up in their library exactly as if they'd uploaded it
// themselves.
function cleanFolder(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^\/+|\/+$/g, '')
}

const MAX_SIZE = 200 * 1024 * 1024 // matches /api/media

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const form = await req.formData()
    const email = form.get('email')
    const file = form.get('file')
    const folder = cleanFolder(form.get('folder') as string | null)

    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be under 200MB' }, { status: 400 })
    }

    const userRows = (await sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string }[]
    const targetUser = userRows[0]
    if (!targetUser) {
      await logAdminAction(sql, { action: 'upload-media', targetEmail: email, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email} — they need to sign up first` }, { status: 404 })
    }

    const pathname = folder ? `${folder}/${file.name}` : file.name
    const blob = await put(`media/${targetUser.id}/${pathname}`, file, { access: 'public', addRandomSuffix: true })

    const id = randomUUID()
    await sql`
      INSERT INTO media_assets (id, user_id, folder, filename, url, content_type, size_bytes)
      VALUES (${id}, ${targetUser.id}, ${folder}, ${file.name}, ${blob.url}, ${file.type}, ${file.size})
    `

    await logAdminAction(sql, { action: 'upload-media', targetEmail: email, params: { folder, filename: file.name }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, id, url: blob.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
