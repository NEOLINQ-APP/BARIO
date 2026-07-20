import OpenAI from 'openai'

let _client: OpenAI | undefined

export function getOpenAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  }
  return _client
}

export const SECTION_TYPES = [
  'nav',
  'hero',
  'features',
  'stats',
  'testimonial',
  'pricing',
  'cta',
  'footer',
] as const

export type SectionType = (typeof SECTION_TYPES)[number]

export type Section = { type: SectionType; data: Record<string, string> }
