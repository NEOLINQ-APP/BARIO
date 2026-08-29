import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { generateImageStandalone } from '@/lib/imageGen'
import { errorResponse } from '@/lib/errors'

// Sequential image generation of a real batch (20+) can run well past the
// platform default — same reasoning as studio/export's 280s cap.
export const maxDuration = 280

// One-off batch tool (2026-08-22) — generates one real AI illustration per
// prompt via generateImageStandalone (no account needed, same generator
// used elsewhere in this codebase), sequentially rather than in parallel
// to stay well under OpenAI's images.generate rate limits on a real burst
// of 20+ calls. Returns {prompt, url} pairs in the same order given.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { prompts, purpose } = (await req.json()) as { prompts?: string[]; purpose?: string }
    if (!Array.isArray(prompts) || prompts.length === 0) {
      return NextResponse.json({ error: 'prompts array is required' }, { status: 400 })
    }
    if (prompts.length > 40) {
      return NextResponse.json({ error: 'Max 40 prompts per batch' }, { status: 400 })
    }

    const results: { prompt: string; url?: string; error?: string }[] = []
    for (const prompt of prompts) {
      try {
        const img = await generateImageStandalone(prompt, (purpose as any) || 'general')
        results.push({ prompt, url: img.url })
      } catch (err: any) {
        results.push({ prompt, error: String(err?.message ?? err) })
      }
    }
    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return errorResponse(err)
  }
}
