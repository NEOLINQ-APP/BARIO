'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

type Msg = { role: 'user' | 'assistant'; content: string }
type LogLine = { kind: 'call' | 'result' | 'text' | 'error'; text: string }

// Bario Build's real editor shell — deliberately a distinct visual identity
// from the rest of Bario's dashboard (violet/near-black instead of the
// amber/slate look used everywhere else), matching the bolt.diy-inspired
// chat + code/preview + terminal layout the user asked for, on top of the
// self-hosted sandbox proven in app/api/build/agent/route.ts.
export default function BuildEditor({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [needsAup, setNeedsAup] = useState(false)
  const [log, setLog] = useState<LogLine[]>([])
  const [tab, setTab] = useState<'code' | 'preview'>('preview')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [savingFile, setSavingFile] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(true)
  const [previewNonce, setPreviewNonce] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<HTMLDivElement>(null)

  async function refreshFiles() {
    const res = await fetch(`/api/build/projects/${projectId}/files`)
    const data = await res.json().catch(() => ({}))
    if (Array.isArray(data.files)) setFiles(data.files)
  }

  async function openFile(path: string) {
    setActiveFile(path)
    setTab('code')
    const res = await fetch(`/api/build/projects/${projectId}/files?path=${encodeURIComponent(path)}`)
    const data = await res.json().catch(() => ({}))
    setFileContent(typeof data.content === 'string' ? data.content : '')
  }

  async function saveFile() {
    if (!activeFile) return
    setSavingFile(true)
    await fetch(`/api/build/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: activeFile, content: fileContent }),
    })
    setSavingFile(false)
  }

  useEffect(() => {
    fetch(`/api/build/projects/${projectId}/session`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => { if (d.previewUrl) setPreviewUrl(d.previewUrl) })
    refreshFiles()
    // Reopening a project (new tab, next day) picks up its real history —
    // both the chat transcript and every command that was actually run —
    // instead of starting blank, since build_chat_messages persists both.
    fetch(`/api/build/projects/${projectId}/messages`)
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d.messages)) return
        setMessages(d.messages.map((m: any) => ({ role: m.role, content: m.content })).filter((m: Msg) => m.content))
        const priorLog: LogLine[] = []
        for (const m of d.messages) {
          for (const t of m.toolCalls ?? []) {
            priorLog.push({ kind: 'call', text: `$ ${t.name} ${JSON.stringify(t.args)}` })
            priorLog.push({ kind: 'result', text: String(t.result).slice(0, 2000) })
          }
        }
        if (priorLog.length > 0) setLog(priorLog)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    termRef.current?.scrollTo({ top: termRef.current.scrollHeight })
  }, [log])

  function languageFor(path: string) {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript'
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript'
    if (path.endsWith('.json')) return 'json'
    if (path.endsWith('.css')) return 'css'
    if (path.endsWith('.html')) return 'html'
    return 'plaintext'
  }

  async function send(acceptAup?: boolean) {
    const text = input.trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user', content: text } as Msg]
    setMessages(next)
    setInput('')
    setLog([])
    setBusy(true)
    setNeedsAup(false)

    try {
      const res = await fetch('/api/build/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, message: text, legalAccepted: acceptAup ?? undefined }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.requiresAup) {
          setNeedsAup(true)
          setMessages(next.slice(0, -1))
          setInput(text)
        } else {
          setMessages((m) => [...m, { role: 'assistant', content: `Error: ${data.error ?? 'something went wrong'}` }])
        }
        setBusy(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let assistantText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          const evt = JSON.parse(line)
          if (evt.type === 'session') setPreviewUrl(evt.previewUrl)
          else if (evt.type === 'assistant_text') assistantText += (assistantText ? '\n' : '') + evt.delta
          else if (evt.type === 'tool_call') setLog((l) => [...l, { kind: 'call', text: `$ ${evt.name} ${JSON.stringify(evt.args)}` }])
          else if (evt.type === 'tool_result') setLog((l) => [...l, { kind: 'result', text: String(evt.result).slice(0, 2000) }])
          else if (evt.type === 'error') setLog((l) => [...l, { kind: 'error', text: evt.message }])
        }
      }

      if (assistantText) setMessages((m) => [...m, { role: 'assistant', content: assistantText }])
      await refreshFiles()
      // The preview iframe's src is set once when the sandbox session
      // starts, before any code has been written — a dev server started
      // mid-turn (via start_dev_server) never triggers a reload on its own,
      // so it'd otherwise stay stuck on whatever the very first request
      // returned (typically a 404, since nothing was listening yet). Give
      // the server a moment to finish binding its port, then force a real
      // iframe reload via the key prop.
      setTimeout(() => setPreviewNonce((n) => n + 1), 1200)
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${err.message ?? 'something went wrong'}` }])
    }
    setBusy(false)
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#08080b] text-zinc-100 font-sans">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/[0.06] bg-[#0b0b10] shrink-0">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">←</a>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
            <span className="font-semibold text-sm tracking-tight">Bario Build</span>
          </div>
          <span className="text-zinc-600">/</span>
          <span className="text-sm text-zinc-400 font-mono">{projectName}</span>
        </div>
        <button
          disabled
          title="Coming soon"
          className="px-3 py-1.5 rounded-lg bg-violet-600/20 text-violet-300 text-xs font-semibold border border-violet-500/30 opacity-50 cursor-not-allowed"
        >
          Publish
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Chat panel */}
        <div className="w-[380px] shrink-0 border-r border-white/[0.06] bg-[#0a0a0e] flex flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-zinc-500 leading-relaxed">
                Hi, I'm Miko. Describe what you want to build — a website, an app, anything with real backend logic —
                and I'll write the code and run it live.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-sm max-w-[92%] px-3 py-2 rounded-xl whitespace-pre-wrap leading-relaxed ${
                  m.role === 'user' ? 'ml-auto bg-violet-600 text-white' : 'bg-white/[0.04] border border-white/[0.06] text-zinc-200'
                }`}
              >
                {m.content}
              </div>
            ))}
            {needsAup && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-2">
                <p>
                  Bario Build runs AI-generated code in a sandbox — please accept the{' '}
                  <a href="/legal/sandbox-aup" target="_blank" className="underline">Acceptable Use Policy</a> to continue.
                </p>
                <button onClick={() => send(true)} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold">
                  I accept, continue
                </button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send() }} className="p-3 border-t border-white/[0.06] flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe what to build…"
              disabled={busy}
              className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="px-3 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-40"
            >
              {busy ? '…' : '→'}
            </button>
          </form>
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tabs */}
          <div className="h-10 flex items-center gap-1 px-3 border-b border-white/[0.06] bg-[#0b0b10] shrink-0">
            {(['preview', 'code'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                  tab === t ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'preview' ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="h-9 flex items-center gap-2 px-3 border-b border-white/[0.06] bg-[#0a0a0e] shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
                <div className="flex-1 px-2 py-1 rounded-md bg-white/[0.04] text-xs font-mono text-zinc-400 truncate">
                  {previewUrl || 'waiting for sandbox…'}
                </div>
                <button
                  onClick={() => setPreviewNonce((n) => n + 1)}
                  disabled={!previewUrl}
                  title="Reload preview"
                  className="px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30"
                >
                  ↻
                </button>
              </div>
              {previewUrl ? (
                <iframe key={previewNonce} src={previewUrl} className="flex-1 w-full bg-white" title="Live preview" />
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-zinc-600">Starting sandbox…</div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex min-h-0">
              {/* File tree */}
              <div className="w-52 shrink-0 border-r border-white/[0.06] bg-[#0a0a0e] overflow-y-auto py-2">
                {files.length === 0 && <p className="text-xs text-zinc-600 px-3 py-2">No files yet</p>}
                {files.map((f) => (
                  <button
                    key={f}
                    onClick={() => openFile(f)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono truncate ${
                      activeFile === f ? 'bg-violet-600/20 text-violet-300' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Editor + terminal */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 min-h-0 flex flex-col">
                  {activeFile ? (
                    <>
                      <div className="h-9 flex items-center justify-between px-3 border-b border-white/[0.06] bg-[#0a0a0e] shrink-0">
                        <span className="text-xs font-mono text-zinc-400">{activeFile}</span>
                        <button onClick={saveFile} disabled={savingFile} className="text-xs px-2 py-1 rounded-md bg-violet-600/20 text-violet-300 border border-violet-500/30">
                          {savingFile ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                      <div className="flex-1 min-h-0">
                        <MonacoEditor
                          height="100%"
                          theme="vs-dark"
                          language={languageFor(activeFile)}
                          value={fileContent}
                          onChange={(v) => setFileContent(v ?? '')}
                          options={{ fontSize: 13, minimap: { enabled: false }, automaticLayout: true }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-zinc-600">Select a file to view/edit it</div>
                  )}
                </div>

                {/* Terminal drawer */}
                <div className={`shrink-0 border-t border-white/[0.06] bg-[#0a0a0e] ${terminalOpen ? 'h-56' : 'h-9'}`}>
                  <button
                    onClick={() => setTerminalOpen((o) => !o)}
                    className="h-9 w-full flex items-center gap-2 px-3 text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    <span className="font-mono">▸ terminal</span>
                    <span className="ml-auto">{terminalOpen ? '︿' : '﹀'}</span>
                  </button>
                  {terminalOpen && (
                    <div ref={termRef} className="h-[calc(100%-2.25rem)] overflow-y-auto px-3 pb-3 font-mono text-[11px] leading-relaxed">
                      {log.length === 0 && <p className="text-zinc-700">Tool calls and command output will appear here.</p>}
                      {log.map((l, i) => (
                        <div
                          key={i}
                          className={
                            l.kind === 'call' ? 'text-cyan-400' : l.kind === 'error' ? 'text-red-400' : 'text-zinc-400'
                          }
                        >
                          <pre className="whitespace-pre-wrap break-all">{l.text}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
