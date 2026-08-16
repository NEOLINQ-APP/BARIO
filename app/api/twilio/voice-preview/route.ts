import { NextResponse } from 'next/server'
import { buildVictoriaConnectTwiml } from '@/lib/victoriaTwiml'

// Temporary — used once to let Sherwin actually hear candidate ElevenLabs
// voices by real phone call before picking Layla's permanent voice, rather
// than trusting an ID's claimed characteristics (the exact mistake that
// caused the earlier male-voice regression). Safe to delete once a voice
// is picked; not linked from anywhere in the product.
export async function POST(req: Request) {
  const url = new URL(req.url)
  const voiceId = url.searchParams.get('voice') ?? ''
  const label = url.searchParams.get('label') ?? 'this option'

  if (!voiceId) {
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Missing voice id.</Say></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const greeting = `Hi Sherwin, this is voice option ${label}. I'm about to be your new assistant, Layla. Let me know what you think.`
  return new NextResponse(buildVictoriaConnectTwiml(greeting, voiceId), { headers: { 'Content-Type': 'text/xml' } })
}
