import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { put } from '@/lib/storage'
import { errorResponse } from '@/lib/errors'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB — a logo, not a general file upload

// Org-owned asset, not personal X-Drive storage — uploads straight through
// lib/b2Storage.ts's put() instead of /api/media's media_assets/quota
// bookkeeping (same reasoning as lib/imageGen.ts's upload path), and writes
// the URL directly onto bo_organizations.branding_logo_url, the column
// generateBoInvoicePdf() and the public invoice view already read but that
// has never had a write path anywhere in the codebase.
export async function POST(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can change the company logo' }, { status: 403 })
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Logo must be an image file' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Logo must be under 5MB' }, { status: 400 })
    }

    const blob = await put(`bario-one/${org.id}/logo/${file.name}`, file, { access: 'public', addRandomSuffix: true, contentType: file.type })

    await sql`UPDATE bo_organizations SET branding_logo_url = ${blob.url}, updated_at = now() WHERE id = ${org.id}`

    return NextResponse.json({ ok: true, url: blob.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
