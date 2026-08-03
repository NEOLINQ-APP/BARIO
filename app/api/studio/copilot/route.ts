import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasStudioAccess } from '@/lib/access'
import { getOpenAI } from '@/lib/openai'
import { errorResponse } from '@/lib/errors'

// The Studio AI copilot — "just like our website builder" (Sky). Unlike
// the website builder or the admin assistant, tools here are NOT executed server-side:
// the editor's actual state (@openvideo/core) lives entirely in the
// browser, so this route only decides WHICH tool(s) to call and with what
// arguments, and hands that back to the client to actually execute against
// the live canvas (see components/StudioEditor.tsx's copilot panel). One
// round per user message — these are fire-once creation actions, not
// lookups the model needs to reason over further within the same turn.
const VIDEO_SYSTEM_PROMPT = `You are Bario Studio's AI assistant, embedded in a video/voiceover editor. Users describe what they want in plain language — in any language, respond in the same language they wrote in — and you call the right tool to create it for them. Not everyone using this is technical, so keep replies short, friendly, and non-jargon.

Tools available:
- generate_video: starts an AI video generation (takes a few minutes). Write a vivid, specific prompt yourself based on what the user described, don't just repeat their words verbatim if they were vague.
- generate_voiceover: generates spoken audio from text using a chosen voice.
- add_text_overlay: adds a text overlay clip directly (instant, no generation).

Pick a sensible voice for generate_voiceover based on context (e.g. a warm female voice for a friendly brand video, unless the user asks for a specific gender/accent). Duration for generate_video must be between 1 and 10 seconds. If the user's request doesn't need a tool (e.g. they're just asking a question about how Studio works), just answer directly.`

const DESIGN_SYSTEM_PROMPT = `You are Bario Studio's AI assistant, embedded in a static design tool (social media posts/stories). Users describe what they want in plain language — in any language, respond in the same language they wrote in — and you call the right tool to build it. Not everyone using this is technical, so keep replies short, friendly, and non-jargon.

Tools available:
- add_text_overlay: adds a headline/caption text layer directly.
- search_stock_image: searches real stock photos and adds a matching one as an image layer — use this whenever the user wants a background or photo and hasn't uploaded their own.

If the user's request doesn't need a tool, just answer directly.`

const VIDEO_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'generate_video',
      description: 'Generate an AI video clip and add it to the canvas.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'A vivid, specific description of the video to generate' },
          durationSeconds: { type: 'number', description: 'Clip length in seconds, 1-10' },
        },
        required: ['prompt', 'durationSeconds'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_voiceover',
      description: 'Generate an AI voiceover from text and add it to the canvas.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text to speak' },
          voiceId: {
            type: 'string',
            enum: ['af_heart', 'af_bella', 'am_adam', 'am_michael', 'bf_emma', 'bm_george'],
            description: 'af_/bf_ = female, am_/bm_ = male; a=American, b=British',
          },
        },
        required: ['text', 'voiceId'],
      },
    },
  },
]

const ADD_TEXT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'add_text_overlay',
    description: 'Add a text overlay/layer to the canvas immediately (no generation delay).',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
}

const SEARCH_STOCK_IMAGE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_stock_image',
    description: 'Search real stock photos and add a matching one as an image layer.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A short, specific search query, e.g. "coffee shop interior"' } },
      required: ['query'],
    },
  },
}

const MAX_MESSAGE_LENGTH = 2000
const MAX_HISTORY = 20

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user || !hasStudioAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use Studio' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const incoming = Array.isArray(body?.messages) ? body.messages : null
    const clipsSummary = typeof body?.clipsSummary === 'string' ? body.clipsSummary.slice(0, 1000) : ''
    const mode = body?.mode === 'design' ? 'design' : 'video'
    if (!incoming || incoming.length === 0) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 })
    }

    const cleaned = incoming
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim())
      .slice(-MAX_HISTORY)
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, MAX_MESSAGE_LENGTH) }))

    if (cleaned.length === 0) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 })
    }

    const basePrompt = mode === 'design' ? DESIGN_SYSTEM_PROMPT : VIDEO_SYSTEM_PROMPT
    const tools = mode === 'design' ? [ADD_TEXT_TOOL, SEARCH_STOCK_IMAGE_TOOL] : [...VIDEO_TOOLS, ADD_TEXT_TOOL]

    const openai = getOpenAI()
    const systemContent = clipsSummary ? `${basePrompt}\n\nCurrent canvas contents: ${clipsSummary}` : basePrompt
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.6-luna',
      max_completion_tokens: 500,
      messages: [{ role: 'system', content: systemContent }, ...cleaned],
      tools,
      // gpt-5.6-luna is a reasoning model — function tools on the chat
      // completions endpoint are only supported with reasoning disabled
      // (confirmed via a live 400: "Function tools with reasoning_effort
      // are not supported... set reasoning_effort to 'none'"). These are
      // simple, fast intent-classification calls, not deep reasoning tasks,
      // so this isn't a real capability tradeoff here.
      reasoning_effort: 'none',
    })

    const msg = completion.choices[0].message
    const toolCalls = (msg.tool_calls || [])
      .filter((c) => c.type === 'function')
      .map((c) => {
        let args: any = {}
        try {
          args = JSON.parse(c.function.arguments || '{}')
        } catch {
          // leave args as {}
        }
        return { name: c.function.name, args }
      })

    return NextResponse.json({ reply: msg.content?.trim() || null, toolCalls })
  } catch (err: any) {
    return errorResponse(err)
  }
}
