import { randomUUID } from 'node:crypto'
import { put } from '@vercel/blob'
import { getOpenAI } from '@/lib/openai'

// Real text-to-image generation — nothing else in this codebase does this
// (lib/unsplash.ts is stock-photo *search* only; RunPod is scoped to
// video/voiceover). Uses the OpenAI client already configured elsewhere in
// this project (Amber, the admin assistant, marketing drafts all use it)
// rather than standing up a new provider. Defaults to the lower-cost
// size/quality tier deliberately — this can be raised per-call if a
// specific request needs it, but shouldn't default to the expensive tier.
export type ImagePurpose = 'logo' | 'icon' | 'avatar' | 'general'

export type GeneratedImage = {
  id: string
  url: string
}

export async function generateImage(sql: any, userId: string, prompt: string, purpose: ImagePurpose = 'general'): Promise<GeneratedImage> {
  const openai = getOpenAI()

  const response = await openai.images.generate({
    model: 'gpt-image-1',
    prompt,
    size: '1024x1024',
    quality: 'low',
    n: 1,
  })

  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error('Image generation returned no data')

  const buffer = Buffer.from(b64, 'base64')
  const filename = `${purpose}-${Date.now()}.png`
  const blob = await put(`media/${userId}/victoria-generated/${filename}`, buffer, {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'image/png',
  })

  const id = randomUUID()
  await sql`
    INSERT INTO media_assets (id, user_id, folder, filename, url, content_type, size_bytes, encrypted, iv)
    VALUES (${id}, ${userId}, ${'victoria-generated'}, ${filename}, ${blob.url}, ${'image/png'}, ${buffer.length}, ${false}, ${null})
  `

  return { id, url: blob.url }
}
