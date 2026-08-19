import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { generateImageStandalone } from '@/lib/imageGen'
import { errorResponse } from '@/lib/errors'

// Throwaway admin route for generating one-off marketing/brand images
// (e.g. Victoria's public-facing avatar) without needing a customer
// account — reuses the same generateImageStandalone() the family-member
// tools already use. Safe to remove once no longer needed.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const prompt = typeof body?.prompt === 'string' ? body.prompt : ''
    if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })

    const image = await generateImageStandalone(prompt, 'avatar')
    return NextResponse.json({ ok: true, url: image.url })
  } catch (err) {
    return errorResponse(err)
  }
}
