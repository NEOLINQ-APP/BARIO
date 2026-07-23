import { NextResponse } from 'next/server'
import { put, del } from '@vercel/blob'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { resolveSiteId } from '@/lib/siteAccess'
import { errorResponse } from '@/lib/errors'

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/jpeg': 'jpg',
}
const MAX_SIZE = 1024 * 1024 // 1MB — favicons are small; this also bounds Blob storage cost

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
    }

    const form = await req.formData()
    const requestedSiteId = form.get('siteId')
    const siteId = await resolveSiteId(sql, session.userId, typeof requestedSiteId === 'string' ? requestedSiteId : null)
    if (!siteId) return NextResponse.json({ error: 'Save your site before uploading a favicon' }, { status: 400 })
    const rows = (await sql`SELECT id, favicon_url FROM sites WHERE id = ${siteId}`) as unknown as {
      id: string
      favicon_url: string | null
    }[]
    const site = rows[0]

    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
      return NextResponse.json({ error: 'Favicon must be a PNG, ICO, or JPEG image' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Favicon must be under 1MB' }, { status: 400 })
    }

    const blob = await put(`favicons/${site.id}-${Date.now()}.${ext}`, file, {
      access: 'public',
      contentType: file.type,
    })

    if (site.favicon_url) {
      try {
        await del(site.favicon_url)
      } catch {
        // Non-fatal: old blob just goes unreferenced instead of being cleaned up.
      }
    }

    await sql`UPDATE sites SET favicon_url = ${blob.url} WHERE id = ${site.id}`

    return NextResponse.json({ ok: true, url: blob.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
