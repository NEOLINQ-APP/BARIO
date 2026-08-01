'use client'

import { useEffect, useRef, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Msg = { role: 'user' | 'assistant'; content: string }
type ToolLogEntry = { tool: string; args: unknown; result: unknown }

type Feed = {
  complaints: { id: string; email: string; subject: string; message: string; status: string; created_at: string }[]
  actions: { id: string; action: string; target_email: string | null; result: string; triggered_by: string; created_at: string }[]
  signups: { email: string; plan: string | null; email_verified: boolean; created_at: string }[]
  sentryConfigured: boolean
}

const GREETING: Msg = {
  role: 'assistant',
  content:
    "Hi — I'm your admin assistant. Ask me anything, or tell me about an issue and I'll fix low-risk stuff myself (account unlocks, plan comps, restoring a broken site). Refunds/cancellations always come to you first.",
}

export default function AdminAssistant() {
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastToolLog, setLastToolLog] = useState<ToolLogEntry[]>([])
  const [feed, setFeed] = useState<Feed | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  function loadFeed() {
    fetch('/api/admin/assistant/feed')
      .then((r) => r.json())
      .then(setFeed)
      .catch(() => {})
  }

  useEffect(() => {
    loadFeed()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user', content: text } as Msg]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/admin/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
      setLastToolLog(data.toolLog ?? [])
      if ((data.toolLog ?? []).length > 0) loadFeed()
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${err.message ?? 'something went wrong'}` }])
    }
    setBusy(false)
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          <div className="flex items-center justify-between gap-4">
            <a href="/admin" className="text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200">← Admin</a>
            <ThemeToggle />
          </div>
          <h1 className="text-2xl font-bold mt-2">Admin Assistant</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">General-purpose + can act on low-risk account fixes autonomously.</p>

          <div className="mt-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] flex flex-col h-[32rem]">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`text-sm max-w-[85%] px-3 py-2 rounded-xl whitespace-pre-wrap ${
                    m.role === 'user' ? 'ml-auto bg-[#f59e0b] text-[#1a1200]' : 'bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {busy && <div className="text-sm bg-white dark:bg-[#0b111c] border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 px-3 py-2 rounded-xl max-w-[85%]">Working…</div>}
              <div ref={bottomRef} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send()
              }}
              className="p-3 border-t border-slate-200 dark:border-zinc-800 flex items-center gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything, or describe an issue to fix…"
                disabled={busy}
                className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="px-4 py-2 rounded-xl bg-[#f59e0b] text-[#1a1200] text-sm font-semibold disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>

          {lastToolLog.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
              <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-2">Actions taken this turn</div>
              <div className="space-y-1">
                {lastToolLog.map((t, i) => (
                  <div key={i} className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                    {t.tool}({JSON.stringify(t.args)}) → {JSON.stringify(t.result).slice(0, 140)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {!feed?.sentryConfigured && (
            <div className="rounded-xl border border-amber-400/40 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              Error feed not connected — add SENTRY_API_TOKEN to enable it.
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
            <div className="text-sm font-semibold mb-3">Recent complaints</div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {feed?.complaints.length === 0 && <p className="text-xs text-slate-500 dark:text-zinc-500">None yet.</p>}
              {feed?.complaints.map((c) => (
                <div key={c.id} className="text-xs border-b border-slate-200 dark:border-zinc-800 pb-2">
                  <div className="text-slate-700 dark:text-zinc-300 font-medium">{c.email}</div>
                  <div className="text-slate-500 dark:text-zinc-500 line-clamp-2">{c.message}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
            <div className="text-sm font-semibold mb-3">Recent signups</div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {feed?.signups.map((s) => (
                <div key={s.email} className="text-xs text-slate-500 dark:text-zinc-400 flex justify-between gap-2">
                  <span className="truncate">{s.email}</span>
                  <span className={s.email_verified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                    {s.email_verified ? 'verified' : 'unverified'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
            <div className="text-sm font-semibold mb-3">Admin action log</div>
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {feed?.actions.map((a) => (
                <div key={a.id} className="text-xs text-slate-500 dark:text-zinc-400">
                  <span className={a.triggered_by === 'ai_autonomous' ? 'text-[#f59e0b]' : 'text-slate-600 dark:text-zinc-300'}>
                    {a.triggered_by === 'ai_autonomous' ? '🤖' : '👤'} {a.action}
                  </span>{' '}
                  {a.target_email && <span className="text-slate-500 dark:text-zinc-500">→ {a.target_email}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
