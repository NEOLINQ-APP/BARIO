import { NextResponse } from 'next/server'
import { put } from '@/lib/b2Storage'
import { db } from '@/lib/db'
import { verifyFamilyToken } from '@/lib/victoriaFamilyAccess'
import { errorResponse } from '@/lib/errors'

// Lets a family member attach a photo/video/document to send to Victoria,
// same as Sherwin's own /api/media -- but token-gated instead of
// session-gated (they have no Bario account), and stored under its own B2
// prefix rather than a user's X-Drive.
const MAX_SIZE = 100 * 1024 * 1024

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const memberKey = form.get('member')
    const token = form.get('token')
    const file = form.get('file')

    const sql = await db()
    const member = await verifyFamilyToken(sql, typeof memberKey === 'string' ? memberKey : null, typeof token === 'string' ? token : null)
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File must be under 100MB' }, { status: 400 })

    const blob = await put(`victoria-family/${member.key}/${file.name}`, file, { access: 'public', addRandomSuffix: true, contentType: file.type })

    return NextResponse.json({ ok: true, url: blob.url })
  } catch (err) {
    return errorResponse(err)
  }
}
