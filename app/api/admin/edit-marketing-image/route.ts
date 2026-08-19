import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getOpenAI } from '@/lib/openai'
import { errorResponse } from '@/lib/errors'
import OpenAI from 'openai'

// Temporary admin route (same throwaway pattern as generate-marketing-image)
// for gpt-image-1 image *edits* — takes a source image + prompt so a second
// frame (e.g. "same character, mouth open") stays visually consistent with
// the first, instead of an independent generate() call producing a
// different-looking person each time.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json().catch(() => ({}))
    const prompt = typeof body?.prompt === 'string' ? body.prompt : ''
    const sourceBase64 = typeof body?.sourceBase64 === 'string' ? body.sourceBase64 : ''
    if (!prompt || !sourceBase64) {
      return NextResponse.json({ error: 'prompt and sourceBase64 are required' }, { status: 400 })
    }
    const openai = getOpenAI()
    const sourceBuffer = Buffer.from(sourceBase64, 'base64')
    const file = await OpenAI.toFile(sourceBuffer, 'source.png', { type: 'image/png' })
    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: file,
      prompt,
      size: '1024x1024',
      quality: 'low',
    })
    const b64 = response.data?.[0]?.b64_json
    if (!b64) return NextResponse.json({ error: 'Image edit returned no data' }, { status: 502 })
    return NextResponse.json({ ok: true, base64: b64 })
  } catch (err) {
    return errorResponse(err)
  }
}
