import { NextResponse } from 'next/server'
import { put } from '@/lib/storage'
import { requireAdmin } from '@/lib/admin'
import { getSetting, setSetting } from '@/lib/platformSettings'
import { errorResponse } from '@/lib/errors'

const ALLOWED_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }
const MAX_SIZE = 2 * 1024 * 1024

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const url = await getSetting(auth.sql, 'document_logo_url')
    return NextResponse.json({ ok: true, url })
  } catch (err) {
    return errorResponse(err)
  }
}

// Custom logo shown on invoices/paystubs in place of Bario's own —
// requested so paystubs (and invoices, if desired) can carry whatever
// letterhead the admin wants instead of Bario's branding.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    const ext = ALLOWED_TYPES[file.type]
    if (!ext) return NextResponse.json({ error: 'Logo must be a PNG, JPEG, or SVG image' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Logo must be under 2MB' }, { status: 400 })

    const blob = await put(`document-logos/logo-${Date.now()}.${ext}`, file, { access: 'public', contentType: file.type })
    await setSetting(auth.sql, 'document_logo_url', blob.url)

    return NextResponse.json({ ok: true, url: blob.url })
  } catch (err) {
    return errorResponse(err)
  }
}
