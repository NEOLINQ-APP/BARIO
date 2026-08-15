import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai'
import OpenAI from 'openai'
import { getOpenAI } from '@/lib/openai'

// Bario Build's agent loop needs one model call per turn that can return
// either plain text or tool calls, on an OpenAI-shaped running transcript
// (system/user/assistant-with-tool_calls/tool messages — the shape
// app/api/build/agent/route.ts already builds up). This is a thin
// abstraction over several real, different provider APIs so that route can
// call one function regardless of which provider actually served the
// request, rather than special-casing each shape inline.
//
// Primary: OpenAI (gpt-5.6-luna, fast, cheap — same choice already made for
// the section-based site builder, and confirmed faster than Claude Opus 5
// on this exact tool-calling workload via a real head-to-head timed test,
// not assumed). Fallback chain on a real failure of the primary: Anthropic
// (claude-opus-5) -> xAI (grok-code-fast-1, xAI's model explicitly
// positioned for coding/agentic tasks, not a general chat tier) -> Google
// (gemini-2.5-flash). This is a reliability measure, not a speed one — it
// doesn't make the happy path faster, it means a real provider outage
// doesn't leave the user stuck with a raw error.

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type ToolDef = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type Provider = 'openai' | 'anthropic' | 'xai' | 'gemini'
export type ModelToolCall = { id: string; name: string; args: any }
export type ModelResult = { content: string | null; toolCalls: ModelToolCall[]; provider: Provider }

let anthropicClient: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

let xaiClient: OpenAI | null = null
function getXai(): OpenAI {
  if (!xaiClient) {
    if (!process.env.XAI_API_KEY) throw new Error('XAI_API_KEY is not configured')
    // xAI's API is OpenAI-compatible, so the regular OpenAI SDK works
    // against it unchanged — just a different base URL and key.
    xaiClient = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' })
  }
  return xaiClient
}

let geminiClient: GoogleGenAI | null = null
function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured')
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  }
  return geminiClient
}

const FALLBACK_ORDER: Provider[] = ['anthropic', 'xai', 'gemini']

export async function callAgentModel(
  messages: ChatMessage[],
  tools: ToolDef[],
  opts: { forceProvider?: Provider } = {}
): Promise<ModelResult> {
  if (opts.forceProvider && opts.forceProvider !== 'openai') {
    return callProvider(opts.forceProvider, messages, tools)
  }

  try {
    return await callOpenAI(messages, tools)
  } catch (err) {
    console.error('Bario Build: OpenAI call failed, trying fallback chain', err)
  }

  let lastErr: unknown
  for (const provider of FALLBACK_ORDER) {
    try {
      return await callProvider(provider, messages, tools)
    } catch (err) {
      lastErr = err
      console.error(`Bario Build: ${provider} fallback failed, trying next`, err)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All model providers failed')
}

function callProvider(provider: Provider, messages: ChatMessage[], tools: ToolDef[]): Promise<ModelResult> {
  if (provider === 'anthropic') return callClaude(messages, tools)
  if (provider === 'xai') return callXai(messages, tools)
  return callGemini(messages, tools)
}

async function callOpenAI(messages: ChatMessage[], tools: ToolDef[]): Promise<ModelResult> {
  const openai = getOpenAI()
  const completion = await openai.chat.completions.create({
    model: 'gpt-5.6-luna',
    max_completion_tokens: 2000,
    messages: messages as any,
    tools,
    reasoning_effort: 'none',
  })
  return { ...parseOpenAIStyleChoice(completion.choices[0].message), provider: 'openai' }
}

async function callXai(messages: ChatMessage[], tools: ToolDef[]): Promise<ModelResult> {
  const xai = getXai()
  const completion = await xai.chat.completions.create({
    model: 'grok-code-fast-1',
    max_completion_tokens: 2000,
    messages: messages as any,
    tools,
  })
  return { ...parseOpenAIStyleChoice(completion.choices[0].message), provider: 'xai' }
}

// xAI's Chat Completions API is OpenAI-shaped, so the same response
// parsing works for both — kept as one function rather than duplicated.
function parseOpenAIStyleChoice(msg: { content?: string | null; tool_calls?: any[] }): { content: string | null; toolCalls: ModelToolCall[] } {
  const toolCalls = (msg.tool_calls || [])
    .filter((c) => c.type === 'function')
    .map((c) => {
      let args: any = {}
      try { args = JSON.parse(c.function.arguments || '{}') } catch {}
      return { id: c.id, name: c.function.name, args: repairDoubleEscapedArgs(args) }
    })
  return { content: msg.content?.trim() || null, toolCalls }
}

// Real bug hit live 2026-08-01 (gpt-5.6-luna, this route's primary
// provider): the model occasionally JSON-encodes a tool argument's string
// value (almost always write_file's `content`) a second time before
// embedding it in `function.arguments` — as if it built the file text,
// JSON.stringify'd it, and pasted that stringified result into the
// argument rather than the raw text. Our single JSON.parse above only
// undoes the outer layer, so files land on disk with literal `\"` / `\n`
// baked into them as text — e.g. `<div id=\"root\">` instead of
// `<div id="root">` — which breaks npm install, JSX, everything.
//
// Fix: for each string value, try unwrapping one more layer of JSON-string
// escaping. This only succeeds when the string is *actually* over-escaped
// — legitimately-correct content almost always contains a raw quote,
// newline, or backslash sequence that isn't valid to re-wrap as a JSON
// string body, so JSON.parse throws and we keep the original untouched.
// That asymmetry is what makes this safe to apply unconditionally rather
// than needing a fragile "does this look corrupted" heuristic. Known
// residual edge case: a file that uses single quotes exclusively (so no
// raw `"` breaks the re-wrap) and also contains a literal `\n`/`\t`/`\\`
// sequence that's coincidentally valid JSON escape syntax (e.g. a regex
// like /\n/) could misfire. Rare enough in practice, and strictly better
// than the guaranteed corruption this replaces.
function repairDoubleEscapedArgs(args: any): any {
  if (typeof args !== 'object' || args === null) return args
  const out: any = Array.isArray(args) ? [] : {}
  for (const key of Object.keys(args)) {
    const val = args[key]
    if (typeof val === 'string') {
      out[key] = unwrapIfDoubleEscaped(val)
    } else if (typeof val === 'object' && val !== null) {
      out[key] = repairDoubleEscapedArgs(val)
    } else {
      out[key] = val
    }
  }
  return out
}

function unwrapIfDoubleEscaped(value: string): string {
  if (!value.includes('\\"') && !value.includes('\\n') && !value.includes('\\\\')) return value
  try {
    const unwrapped = JSON.parse(`"${value}"`)
    return typeof unwrapped === 'string' ? unwrapped : value
  } catch {
    return value
  }
}

async function callClaude(messages: ChatMessage[], tools: ToolDef[]): Promise<ModelResult> {
  const anthropic = getAnthropic()
  const system = messages.find((m) => m.role === 'system')?.content as string | undefined
  const claudeMessages = toClaudeMessages(messages.filter((m) => m.role !== 'system'))
  const claudeTools = tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }))

  const response = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2000,
    system,
    messages: claudeMessages,
    tools: claudeTools,
  })

  let content: string | null = null
  const toolCalls: ModelToolCall[] = []
  for (const block of response.content) {
    if (block.type === 'text') content = ((content ?? '') + block.text).trim() || null
    else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, args: block.input })
  }
  return { content, toolCalls, provider: 'anthropic' }
}

// OpenAI's transcript shape (assistant tool_calls + separate tool-role
// messages) has to become Anthropic's (tool_use content blocks on the
// assistant turn, tool_result content blocks bundled into the *next* user
// turn). Consecutive tool-role messages collapse into one user message
// with multiple tool_result blocks, matching what the API requires.
function toClaudeMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const tc of m.tool_calls ?? []) {
        let input: any = {}
        try { input = JSON.parse(tc.function.arguments || '{}') } catch {}
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input })
      }
      out.push({ role: 'assistant', content: blocks })
    } else if (m.role === 'tool') {
      const last = out[out.length - 1]
      const block: Anthropic.ContentBlockParam = { type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }
      if (last?.role === 'user' && Array.isArray(last.content)) last.content.push(block)
      else out.push({ role: 'user', content: [block] })
    }
  }
  return out
}

async function callGemini(messages: ChatMessage[], tools: ToolDef[]): Promise<ModelResult> {
  const ai = getGemini()
  const system = messages.find((m) => m.role === 'system')?.content as string | undefined
  const contents = toGeminiContents(messages.filter((m) => m.role !== 'system'))
  const functionDeclarations = tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parametersJsonSchema: t.function.parameters,
  }))

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      systemInstruction: system,
      tools: [{ functionDeclarations }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
    },
  })

  const content = response.text?.trim() || null
  const toolCalls: ModelToolCall[] = (response.functionCalls ?? []).map((fc, i) => ({
    id: fc.id ?? `gemini-call-${i}`,
    name: fc.name ?? 'unknown',
    args: fc.args ?? {},
  }))
  return { content, toolCalls, provider: 'gemini' }
}

// Gemini uses 'user'/'model' roles (not 'assistant') and represents tool
// activity as functionCall/functionResponse Parts rather than a separate
// message role — same "collapse consecutive tool results into one turn"
// shape as the Claude converter above, adapted to Gemini's Part structure.
//
// functionResponse.name must be the actual tool name (matching the
// FunctionCall it answers), not the call id — the id is only for
// correlating which call it belongs to. ChatMessage's 'tool' variant only
// carries the id, so the name is looked up from the preceding 'model' turn
// that issued the matching functionCall, rather than threading an extra
// field through the OpenAI-shaped message type everything else relies on.
function toGeminiContents(messages: ChatMessage[]) {
  const out: { role: string; parts: any[] }[] = []
  const nameByCallId = new Map<string, string>()
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', parts: [{ text: m.content }] })
    } else if (m.role === 'assistant') {
      const parts: any[] = []
      if (m.content) parts.push({ text: m.content })
      for (const tc of m.tool_calls ?? []) {
        let args: any = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
        parts.push({ functionCall: { id: tc.id, name: tc.function.name, args } })
        nameByCallId.set(tc.id, tc.function.name)
      }
      out.push({ role: 'model', parts })
    } else if (m.role === 'tool') {
      const name = nameByCallId.get(m.tool_call_id) ?? m.tool_call_id
      const part = { functionResponse: { id: m.tool_call_id, name, response: { output: m.content } } }
      const last = out[out.length - 1]
      if (last?.role === 'user') last.parts.push(part)
      else out.push({ role: 'user', parts: [part] })
    }
  }
  return out
}
