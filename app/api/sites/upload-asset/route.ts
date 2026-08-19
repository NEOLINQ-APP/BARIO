import { NextResponse } from 'next/server'
import { createPresignedUploadUrl } from '@/lib/storage'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'

// Client-side direct-to-storage upload — the browser PUTs file bytes
// straight to B2 via a short-lived presigned URL, never through this
// serverless function's body, so video/audio attachments aren't capped by
// Vercel's ~4.5MB request limit. This route only ever issues that presigned
// URL after checking auth.
const ALLOWED_CONTENT_TYPE_PREFIXES = ['image/', 'video/', 'audio/']
const MAX_SIZE = 100 * 1024 * 1024 // 100MB

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

    const { filename, contentType, size } = (await req.json()) as { filename?: string; contentType?: string; size?: number }
    if (!filename || !contentType) {
      return NextResponse.json({ error: 'filename and contentType are required' }, { status: 400 })
    }
    if (!ALLOWED_CONTENT_TYPE_PREFIXES.some((p) => contentType.startsWith(p))) {
      return NextResponse.json({ error: 'Only image, video, or audio files are supported' }, { status: 400 })
    }
    if (typeof size === 'number' && size > MAX_SIZE) {
      return NextResponse.json({ error: 'File is too large (100MB max)' }, { status: 400 })
    }

    const result = await createPresignedUploadUrl(`builder-assets/${session.userId}/${filename}`, {
      contentType,
      addRandomSuffix: true,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    return errorResponse(err)
  }
}
