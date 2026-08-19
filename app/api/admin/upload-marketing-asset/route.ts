import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { put } from '@/lib/storage'
import { errorResponse } from '@/lib/errors'

// Throwaway admin route, same spirit as generate-marketing-image — uploads
// a one-off marketing asset (e.g. the intro video voiceover) that isn't
// tied to any customer account. Safe to remove once no longer needed.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const base64 = typeof body?.base64 === 'string' ? body.base64 : ''
    const filename = typeof body?.filename === 'string' ? body.filename : ''
    const contentType = typeof body?.contentType === 'string' ? body.contentType : 'application/octet-stream'
    if (!base64 || !filename) return NextResponse.json({ error: 'base64 and filename are required' }, { status: 400 })

    const buffer = Buffer.from(base64, 'base64')
    const blob = await put(`victoria-family-generated/${filename}`, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType,
    })

    return NextResponse.json({ ok: true, url: blob.url })
  } catch (err) {
    return errorResponse(err)
  }
}
