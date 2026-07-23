import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'

// Client-side direct-to-Blob upload — the file goes straight from the
// browser to storage, never through this serverless function's body, so
// video/audio attachments aren't capped by Vercel's ~4.5MB request limit.
// This route only ever issues a short-lived upload token after checking auth.
const ALLOWED_CONTENT_TYPES = ['image/*', 'video/*', 'audio/*']
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

    const body = (await req.json()) as HandleUploadBody

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: session.userId }),
        }
      },
      onUploadCompleted: async () => {
        // No DB write needed here — the resulting URL is attached to a chat
        // message client-side and only persisted if it ends up in a section.
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (err: any) {
    return errorResponse(err)
  }
}
