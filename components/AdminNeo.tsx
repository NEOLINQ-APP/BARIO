'use client'

import { useEffect, useRef, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Incident = {
  id: string
  source: string
  category: string
  severity: 'info' | 'warning' | 'critical'
  description: string
  status: string
  action_taken: string | null
  proposed_tool?: string | null
  proposed_args_json?: string | null
  proposed_label?: string | null
  last_seen_at?: string
  resolved_at?: string
  created_at: string
}

type Msg = { role: 'user' | 'assistant'; content: string }
type ToolLogEntry = { tool: string; args: unknown; result: unknown }

type Feed = {
  complaints: { id: string; email: string; subject: string; message: string; status: string; created_at: string }[]
  actions: { id: string; action: string; target_email: string | null; result: string; triggered_by: string; created_at: string }[]
  signups: { email: string; plan: string | null; email_verified: boolean; created_at: string }[]
  sentryConfigured: boolean
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-red-400 text-red-600 dark:border-red-500/40 dark:text-red-400',
  warning: 'border-amber-400 text-amber-600 dark:border-amber-500/40 dark:text-amber-400',
  info: 'border-slate-300 text-slate-500 dark:border-zinc-700 dark:text-zinc-400',
}

const GREETING: Msg = {
  role: 'assistant',
  content:
    "Hi — I'm NEO. I run a health check every 15 minutes and flag or fix real infrastructure problems, and you can also ask me directly to investigate or repair something — account unlocks, plan comps, restoring a broken site, and more. Refunds/cancellations always come to you first.",
}

export default function AdminNeo() {
  const [open, setOpen] = useState<Incident[] | null>(null)
  const [resolved, setResolved] = useState<Incident[]>([])
  const [loadingIncidents, setLoadingIncidents] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)

  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastToolLog, setLastToolLog] = useState<ToolLogEntry[]>([])
  const [feed, setFeed] = useState<Feed | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  function loadIncidents() {
    fetch('/api/admin/neo/incidents')
      .then((res) => res.json())
      .then((data) => {
        setOpen(data.open ?? [])
        setResolved(data.recentResolved ?? [])
      })
      .finally(() => setLoadingIncidents(false))
  }

  function loadFeed() {
    fetch('/api/admin/assistant/feed')
      .then((r) => r.json())
      .then(setFeed)
      .catch(() => {})
  }

  useEffect(() => {
    loadIncidents()
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

  async function approve(id: string) {
    setApproving(id)
    try {
      const res = await fetch(`/api/admin/neo/incidents/${id}/approve`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not approve')
      loadIncidents()
    } catch (err: any) {
      alert(err.message)
    }
    setApproving(null)
  }

  async function deny(id: string) {
    setApproving(id)
    try {
      const res = await fetch(`/api/admin/neo/incidents/${id}/deny`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not deny')
      loadIncidents()
    } catch (err: any) {
      alert(err.message)
    }
    setApproving(null)
  }

  const pendingApproval = open?.filter((i) => i.status === 'pending_approval') ?? []
  const needsReview = open?.filter((i) => i.status !== 'pending_approval') ?? []

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          <div className="flex items-center justify-between gap-4">
            <a href="/admin" className="text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200">← Admin</a>
            <ThemeToggle />
          </div>
          <h1 className="text-2xl font-bold mt-2">NEO 🛰️</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Runs a health check every 15 minutes, proposes or auto-fixes real issues, and takes direct requests in chat.
          </p>

          {pendingApproval.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold mb-3 text-amber-600 dark:text-amber-400">Needs your approval ({pendingApproval.length})</h2>
              <div className="space-y-2">
                {pendingApproval.map((inc) => (
                  <div key={inc.id} className="rounded-xl border border-amber-400/50 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${SEVERITY_STYLE[inc.severity] ?? SEVERITY_STYLE.info}`}>
                        {inc.severity}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-zinc-500">{inc.category}</span>
                    </div>
                    <p className="text-sm mt-2">{inc.description}</p>
                    <p className="text-xs mt-1 font-medium text-amber-700 dark:text-amber-300">Proposed fix: {inc.proposed_label}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => approve(inc.id)}
                        disabled={approving === inc.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs"
                      >
                        {approving === inc.id ? 'Working…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => deny(inc.id)}
                        disabled={approving === inc.id}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 disabled:opacity-50 text-xs"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-sm font-semibold mt-8 mb-3">Needs review ({needsReview.length || (loadingIncidents ? '…' : 0)})</h2>
          {loadingIncidents && <p className="text-xs text-slate-400 dark:text-zinc-500">Loading…</p>}
          {!loadingIncidents && needsReview.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-zinc-500">Nothing open — all clear as of the last check.</p>
          )}
          <div className="space-y-2">
            {needsReview.map((inc) => (
              <div key={inc.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${SEVERITY_STYLE[inc.severity] ?? SEVERITY_STYLE.info}`}>
                    {inc.severity}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-zinc-500">{inc.category}</span>
                </div>
                <p className="text-sm mt-2">{inc.description}</p>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                  Last seen {new Date(inc.last_seen_at ?? inc.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] flex flex-col h-[28rem]">
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
                placeholder="Ask NEO anything, or describe an issue to fix…"
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

          <h2 className="text-sm font-semibold mt-8 mb-3">Recently resolved</h2>
          {!loadingIncidents && resolved.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-zinc-500">Nothing resolved yet.</p>
          )}
          <div className="space-y-2">
            {resolved.map((inc) => (
              <div key={inc.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${inc.status === 'auto_fixed' ? 'border-emerald-400 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400' : SEVERITY_STYLE.info}`}
                  >
                    {inc.status === 'auto_fixed' ? 'fixed' : 'resolved'}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-zinc-500">{inc.category}</span>
                </div>
                <p className="text-sm mt-2 text-slate-600 dark:text-zinc-300">{inc.description}</p>
                {inc.action_taken && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">Action: {inc.action_taken}</p>
                )}
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                  {new Date(inc.resolved_at ?? inc.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
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
