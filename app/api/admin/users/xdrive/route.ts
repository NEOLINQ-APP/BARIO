import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'
import type { MediaAsset } from '@/lib/db'

// Admin visibility + full-wipe for a specific customer's X-Drive
// (media_assets) — separate from /api/admin/storage, which is the shared
// internal file manager (assets table), not tied to any one customer.
async function resolveUser(sql: any, email: string) {
  const rows = (await sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string }[]
  return rows[0] ?? null
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const email = new URL(req.url).searchParams.get('email')
    if (!email?.trim()) return NextResponse.json({ error: 'email query param is required' }, { status: 400 })

    const targetUser = await resolveUser(sql, email)
    if (!targetUser) return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })

    const files = (await sql`SELECT id, folder, filename, url, size_bytes, created_at FROM media_assets WHERE user_id = ${targetUser.id} ORDER BY folder, filename`) as unknown as MediaAsset[]
    return NextResponse.json({ ok: true, count: files.length, files })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Deletes every file in a customer's X-Drive — both the DB rows and the
// underlying Vercel Blob objects (not just hiding rows and leaving orphaned
// storage behind). Irreversible; this is a real wipe, not a soft-delete.
export async function DELETE(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    const targetUser = await resolveUser(sql, email)
    if (!targetUser) return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })

    const files = (await sql`SELECT id, url FROM media_assets WHERE user_id = ${targetUser.id}`) as unknown as { id: string; url: string }[]

    for (const f of files) {
      try {
        await del(f.url)
      } catch (err) {
        console.error(`Failed to delete blob for ${f.id}:`, err)
      }
    }
    await sql`DELETE FROM media_assets WHERE user_id = ${targetUser.id}`

    await logAdminAction(sql, { action: 'wipe-xdrive', targetEmail: email, params: { filesDeleted: files.length }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, filesDeleted: files.length })
  } catch (err: any) {
    return errorResponse(err)
  }
}
