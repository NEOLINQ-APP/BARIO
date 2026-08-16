import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { put } from '@/lib/b2Storage'
import { parseReceiptImage } from '@/lib/barioOneExpenses'
import { errorResponse } from '@/lib/errors'

const MAX_SIZE = 15 * 1024 * 1024 // a phone photo, not a general file upload

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Receipt must be a photo' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Photo must be under 15MB' }, { status: 400 })
    }

    const blob = await put(`bario-one/${org.id}/expenses/${file.name}`, file, { access: 'public', addRandomSuffix: true, contentType: file.type })

    const { extraction, raw } = await parseReceiptImage(blob.url)

    const id = randomUUID()
    await sql`
      INSERT INTO bo_expenses (
        id, organization_id, vendor, category, amount_cents, tax_cents, expense_date,
        receipt_image_url, ocr_raw_json, status, created_by_user_id
      )
      VALUES (
        ${id}, ${org.id}, ${extraction.vendor}, ${extraction.category || 'uncategorized'},
        ${extraction.amountCents ?? 0}, ${extraction.taxCents ?? 0}, ${extraction.date},
        ${blob.url}, ${raw}, 'needs_review', ${user.id}
      )
    `

    return NextResponse.json({ ok: true, id, extraction })
  } catch (err: any) {
    return errorResponse(err)
  }
}
