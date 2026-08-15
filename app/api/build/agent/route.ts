import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuildAccess } from '@/lib/access'
import { recordLegalAcceptance } from '@/lib/legal'
import { CURRENT_SANDBOX_POLICY_VERSION } from '@/lib/legalVersion'
import { callAgentModel } from '@/lib/buildAgentModel'
import { execInSandbox, writeSandboxFile } from '@/lib/sandboxHost'
import { ensureSandboxSession } from '@/lib/buildSession'
import { errorResponse } from '@/lib/errors'

export const maxDuration = 120

// Bario Build's AI agent loop — genuinely multi-turn tool-calling (read a
// file, see its content, decide the next edit, run a command, see its
// output, decide what's next), unlike app/api/builder/generate's one-shot
// structured-output call. Streams NDJSON, same convention as that route,
// so the client can render progress live rather than waiting for the whole
// turn to finish. Tool calls act directly against the live sandbox session.
//
// Chat/command history is server-authoritative (build_chat_messages), not
// client-supplied — the client only ever sends the newest user message;
// this route loads prior turns from the DB itself. That's what makes a
// project resumable across tab closes/reloads, and what "save all commands
// so they know it for next time" actually means end to end: every turn's
// tool calls are persisted alongside the assistant's reply, not just kept
// in browser memory.

const SYSTEM_PROMPT = `You are Miko, Bario Build's AI assistant — you build real, running applications by writing actual project files and running real shell commands inside a live sandbox, not by filling in a fixed template. Users describe what they want in plain language; you write the code.

You have tools to read/write/list/delete files and run shell commands inside the project directory (/project). Use run_command for one-off commands (npm install, etc.) and start_dev_server exactly once to boot the app so its live preview works — don't call start_dev_server more than once per session unless the user asks you to restart it.

The live preview always proxies to port 3000 inside the sandbox — this is fixed infrastructure, not configurable. Whatever dev server you start MUST bind to host 0.0.0.0, port 3000, even though that isn't a given framework's default. Examples: Vite → \`vite --host 0.0.0.0 --port 3000\`; Next.js → \`next dev -p 3000 -H 0.0.0.0\`; a plain Node/Express server → \`app.listen(3000, '0.0.0.0')\` in the code itself. If you start a server on its framework's default port instead, the preview will show a permanent "Bad Gateway" with no error surfaced to you — so get the port right the first time rather than debugging it after the fact.

If you're building a Vite project, also create a \`vite.config.js\` with \`server: { host: '0.0.0.0', port: 3000, allowedHosts: true }\`. Vite rejects requests whose Host header it doesn't recognize by default, and the live preview is served through a wildcard subdomain Vite has never seen — without \`allowedHosts: true\` the preview will 403 with "Blocked request" even though the server is running correctly.

Work iteratively: check what files already exist before overwriting, read a file before editing it if you're not sure what's in it, and run the install/build commands a real project needs. When you need to create or edit several independent files, request all of those tool calls together in the same turn rather than one at a time — they run concurrently, so batching them is meaningfully faster than spacing them across separate turns. When you're done with what the user asked for, respond in plain text summarizing what you built — don't call a tool on your final turn.

If the app you're building needs to generate real document files, use well-established Python libraries via run_command (pip install first): \`pypdf\`/\`reportlab\` for PDFs, \`python-docx\` for Word documents, \`openpyxl\` for Excel spreadsheets, \`python-pptx\` for PowerPoint decks. These are the standard, reliable tools for each format — don't hand-roll file formats or guess at binary structures.

Hold your own writing to a professional bar: code comments, commit-style summaries, and any user-facing copy you generate (page text, error messages, docs) should read like it was written by an experienced engineer, not a first draft — clear, precise, no filler.`

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the full contents of a file in the project.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: "Write a file's full contents, creating it (and any parent directories) if it doesn't exist, or overwriting it if it does.",
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_files',
      description: 'List files in the project (excludes node_modules and .git).',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_file',
      description: 'Delete a file from the project.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Run a one-off shell command in the project directory and wait for it to finish (e.g. "npm install"). Do not use this to start a long-running server — use start_dev_server for that.',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'start_dev_server',
      description: 'Start the project\'s dev server in the background so the live preview works (e.g. "npm run dev" or "node server.js"). Call this once the project is ready to run.',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    },
  },
]

const MAX_MESSAGE_LENGTH = 4000
const MAX_HISTORY = 30
const MAX_TOOL_ITERATIONS = 12
const MAX_TOOL_OUTPUT_CHARS = 4000

function encode(obj: unknown) {
  return new TextEncoder().encode(JSON.stringify(obj) + '\n')
}

// Every tool operates on one sandbox session's live filesystem via
// lib/sandboxHost.ts — no server-side free-form host access, no ability
// for the model to touch its own resource limits or network policy, per
// the plan's "fixed, reviewed tool set" security requirement.
async function runTool(sessionId: string, name: string, args: any): Promise<string> {
  switch (name) {
    case 'read_file': {
      const result = await execInSandbox(sessionId, `cat '${String(args.path).replace(/'/g, "'\\''")}'`)
      if ('exitCode' in result && result.exitCode !== 0) return `Error: file not found or unreadable: ${args.path}`
      return 'output' in result ? result.output : ''
    }
    case 'write_file': {
      await writeSandboxFile(sessionId, args.path, args.content ?? '')
      return `Wrote ${args.path}`
    }
    case 'list_files': {
      const result = await execInSandbox(sessionId, `find . -type f -not -path './node_modules/*' -not -path './.git/*' | sed 's#^\\./##'`)
      return 'output' in result ? result.output : ''
    }
    case 'delete_file': {
      await execInSandbox(sessionId, `rm -f '${String(args.path).replace(/'/g, "'\\''")}'`)
      return `Deleted ${args.path}`
    }
    case 'run_command': {
      // 90s, not 30s: a real `npm install` for even a small React/Vite
      // project routinely ran past 30s on this host's 1 vCPU sandboxes,
      // silently killing the install mid-way and leaving no node_modules
      // (found live 2026-08-15) — the model saw a truncated/nonzero exit
      // and had no way to tell "still installing" from "actually failed".
      const result = await execInSandbox(sessionId, `timeout 90 ${args.command}`)
      if ('output' in result) return `exit code ${result.exitCode}\n${result.output}`.slice(0, MAX_TOOL_OUTPUT_CHARS)
      return 'Command failed to run'
    }
    case 'start_dev_server': {
      await execInSandbox(sessionId, args.command, { detached: true })
      return `Started: ${args.command}`
    }
    default:
      return `Unknown tool: ${name}`
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuildAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use Bario Build' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const projectId = typeof body?.projectId === 'string' ? body.projectId : null
    const newMessage = typeof body?.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : null
    const legalAccepted = body?.legalAccepted === true
    if (!projectId || !newMessage) {
      return NextResponse.json({ error: 'projectId and message are required' }, { status: 400 })
    }
    // Admin-only diagnostic override for real head-to-head provider timing
    // comparisons — never exposed to regular customers, who shouldn't be
    // able to force a non-default (and in Claude's/Gemini's/Grok's case,
    // sometimes pricier) provider on demand.
    const forcedProvider =
      user.is_admin && ['anthropic', 'xai', 'gemini'].includes(body?.forceProvider) ? body.forceProvider : undefined

    const projectRows = (await sql`SELECT * FROM build_projects WHERE id = ${projectId} AND user_id = ${user.id}`) as unknown as { id: string }[]
    if (projectRows.length === 0) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const existingAcceptance = (await sql`
      SELECT 1 FROM legal_acceptances
      WHERE user_id = ${user.id} AND policy_slug = 'sandbox_aup' AND policy_version = ${CURRENT_SANDBOX_POLICY_VERSION}
    `) as unknown as unknown[]
    if (existingAcceptance.length === 0) {
      if (!legalAccepted) {
        return NextResponse.json({ error: 'You must accept the Bario Build Acceptable Use Policy to continue', requiresAup: true }, { status: 400 })
      }
      const forwardedFor = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
      await recordLegalAcceptance(sql, {
        userId: user.id,
        policySlug: 'sandbox_aup',
        policyVersion: CURRENT_SANDBOX_POLICY_VERSION,
        ip: forwardedFor,
        userAgent: req.headers.get('user-agent'),
      })
    }

    // Ensure an active sandbox session for this project — one at a time,
    // matching the plan's v1 scope (no multi-session-per-project yet).
    // Shared with the direct file-browsing routes so AI edits and manual
    // edits always land in the same live sandbox.
    const { sandboxSessionId, previewUrl } = await ensureSandboxSession(sql, projectId, user.id)

    const historyRows = (await sql`
      SELECT role, content FROM build_chat_messages
      WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT ${MAX_HISTORY}
    `) as unknown as { role: string; content: string }[]
    const history = historyRows.reverse().map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }))

    await sql`INSERT INTO build_chat_messages (id, project_id, role, content) VALUES (${randomUUID()}, ${projectId}, 'user', ${newMessage})`

    const messages: any[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history, { role: 'user', content: newMessage }]
    const turnLog: { name: string; args: unknown; result: string }[] = []
    // Once OpenAI fails once in a turn, stay on whichever fallback answered
    // for the rest of that turn rather than flip-flopping call to call — a
    // real outage doesn't usually resolve itself mid-request.
    let stickyProvider = forcedProvider

    let assistantText = ''
    // Runs on every exit path (finished, hit the iteration cap, or errored
    // partway through) so the record reflects what actually happened, not
    // just the success case.
    const persistTurn = async () => {
      if (!assistantText && turnLog.length === 0) return
      await sql`
        INSERT INTO build_chat_messages (id, project_id, role, content, tool_calls_json)
        VALUES (${randomUUID()}, ${projectId}, 'assistant', ${assistantText}, ${JSON.stringify(turnLog)})
      `
    }

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encode({ type: 'session', previewUrl }))
        try {
          for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
            const result = await callAgentModel(messages, TOOLS, { forceProvider: stickyProvider })
            if (result.provider !== 'openai' && stickyProvider !== result.provider) {
              stickyProvider = result.provider
              controller.enqueue(encode({ type: 'tool_result', name: '_provider_fallback', result: `Switched to ${result.provider} after an OpenAI error` }))
            }

            if (result.content) {
              assistantText += (assistantText ? '\n' : '') + result.content
              controller.enqueue(encode({ type: 'assistant_text', delta: result.content }))
            }

            if (result.toolCalls.length === 0) {
              await persistTurn()
              controller.enqueue(encode({ type: 'done' }))
              controller.close()
              return
            }

            messages.push({
              role: 'assistant',
              content: result.content,
              tool_calls: result.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })),
            })

            // Real speed fix, not cosmetic: when the model asks for several
            // independent tool calls in the same turn (e.g. writing two
            // separate files), running them one at a time was pure wasted
            // wall-clock time — each one is its own network round trip to
            // the sandbox host. They're dispatched concurrently here;
            // `tool_call` events still enqueue in request order (each map
            // callback runs synchronously up to its first await), and
            // results are collected via Promise.all so the messages array
            // stays correctly ordered regardless of which finishes first.
            const dispatched = result.toolCalls.map(async (call) => {
              controller.enqueue(encode({ type: 'tool_call', name: call.name, args: call.args }))
              const toolResult = await runTool(sandboxSessionId, call.name, call.args)
              const truncated = toolResult.slice(0, MAX_TOOL_OUTPUT_CHARS)
              controller.enqueue(encode({ type: 'tool_result', name: call.name, result: truncated }))
              turnLog.push({ name: call.name, args: call.args, result: truncated })
              return { id: call.id, truncated }
            })
            for (const { id, truncated } of await Promise.all(dispatched)) {
              messages.push({ role: 'tool', tool_call_id: id, content: truncated })
            }
          }
          await persistTurn()
          controller.enqueue(encode({ type: 'done' }))
          controller.close()
        } catch (err: any) {
          await persistTurn().catch(() => {})
          controller.enqueue(encode({ type: 'error', message: err.message ?? 'Something went wrong' }))
          controller.close()
        }
      },
    })

    return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } })
  } catch (err: any) {
    return errorResponse(err)
  }
}
