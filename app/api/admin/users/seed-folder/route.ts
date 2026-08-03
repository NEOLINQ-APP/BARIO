import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { put } from '@vercel/blob'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

function cleanFolder(raw: string): string {
  return raw.trim().replace(/^\/+|\/+$/g, '')
}

// Admin tool to make an empty folder show up in a customer's X-Drive
// ahead of time. Folders in media_assets are just path prefixes on real
// rows (see /api/media) — there's no way to persist an empty one, so this
// drops in a small starter note the customer can delete once they've added
// their own content.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email, folder, note } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    const clean = cleanFolder(String(folder ?? ''))
    if (!clean) {
      return NextResponse.json({ error: 'Folder is required' }, { status: 400 })
    }

    const userRows = (await sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string }[]
    const targetUser = userRows[0]
    if (!targetUser) {
      await logAdminAction(sql, { action: 'seed-folder', targetEmail: email, params: { folder: clean }, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email} — they need to sign up first` }, { status: 404 })
    }

    const text = typeof note === 'string' && note.trim() ? note.trim() : 'This folder is ready — upload your first file and feel free to delete this note.'
    const filename = 'Start here.txt'
    const blob = await put(`media/${targetUser.id}/${clean}/${filename}`, new Blob([text], { type: 'text/plain' }), {
      access: 'public',
      addRandomSuffix: true,
    })

    const id = randomUUID()
    await sql`
      INSERT INTO media_assets (id, user_id, folder, filename, url, content_type, size_bytes)
      VALUES (${id}, ${targetUser.id}, ${clean}, ${filename}, ${blob.url}, 'text/plain', ${text.length})
    `

    await logAdminAction(sql, { action: 'seed-folder', targetEmail: email, params: { folder: clean }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, id, folder: clean })
  } catch (err: any) {
    return errorResponse(err)
  }
}
