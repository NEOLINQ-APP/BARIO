'use client'

import { useEffect, useRef, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Msg = { role: 'user' | 'assistant'; content: string }
type ChangeRequest = {
  id: string
  invoice_id: string | null
  agent_name: string
  change_type: 'create' | 'update'
  summary: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  decided_at: string | null
  decided_by: string | null
  last_error: string | null
}

const GREETING: Msg = {
  role: 'assistant',
  content:
    "Hi, I'm Amber — I help with quotes and invoices. I can look things up freely, but any create or price change I propose goes to you for approval first, nothing happens automatically.",
}

export default function AmberAssistant() {
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([])
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  function loadChangeRequests() {
    fetch('/api/admin/invoices/change-requests')
      .then((r) => r.json())
      .then((data) => data.ok && setChangeRequests(data.changeRequests))
      .catch(() => {})
  }

  useEffect(() => {
    loadChangeRequests()
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
      const res = await fetch('/api/admin/invoices/amber', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
      if ((data.toolLog ?? []).some((t: any) => t.tool?.startsWith('propose_'))) loadChangeRequests()
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${err.message ?? 'something went wrong'}` }])
    }
    setBusy(false)
  }

  async function decide(id: string, action: 'approve' | 'reject') {
    setDecidingId(id)
    try {
      const res = await fetch(`/api/admin/invoices/change-requests/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not decide')
      loadChangeRequests()
    } catch (err: any) {
      alert(err.message)
    }
    setDecidingId(null)
  }

  const pending = changeRequests.filter((c) => c.status === 'pending')
  const decided = changeRequests.filter((c) => c.status !== 'pending')

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div>
          <div className="flex items-center justify-between gap-4">
            <a href="/admin/invoices" className="text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200">← Invoices</a>
            <ThemeToggle />
          </div>
          <h1 className="text-2xl font-bold mt-2">Amber — Finance Assistant</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Ask her to draft a quote, look up an invoice, or propose a price change — every change waits for your approval on the right.</p>

          <div className="mt-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] flex flex-col h-[32rem]">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`text-sm max-w-[85%] px-3 py-2 rounded-xl whitespace-pre-wrap ${
                    m.role === 'user' ? 'ml-auto bg-cyan-500 text-slate-950' : 'bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-800'
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
                placeholder="e.g. Draft an invoice for Acme Co, Business plan monthly…"
                disabled={busy}
                className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-semibold disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-amber-400/40 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4">
            <div className="text-sm font-semibold mb-3">Pending your approval {pending.length > 0 && `(${pending.length})`}</div>
            {pending.length === 0 && <p className="text-xs text-slate-500 dark:text-zinc-500">Nothing waiting.</p>}
            <div className="space-y-3">
              {pending.map((c) => (
                <div key={c.id} className="text-xs border border-amber-300/50 dark:border-amber-500/20 rounded-lg p-3 bg-white/50 dark:bg-black/20">
                  <p className="font-medium text-slate-800 dark:text-zinc-200">{c.summary}</p>
                  <p className="text-slate-500 dark:text-zinc-500 mt-1">{new Date(c.created_at).toLocaleString()}</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => decide(c.id, 'approve')}
                      disabled={decidingId === c.id}
                      className="px-2 py-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => decide(c.id, 'reject')}
                      disabled={decidingId === c.id}
                      className="px-2 py-1 rounded-md border border-red-400 text-red-600 dark:text-red-400 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
            <div className="text-sm font-semibold mb-3">Decision history</div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {decided.length === 0 && <p className="text-xs text-slate-500 dark:text-zinc-500">None yet.</p>}
              {decided.map((c) => (
                <div key={c.id} className="text-xs border-b border-slate-200 dark:border-zinc-800 pb-2">
                  <p className={c.status === 'approved' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-red-500 dark:text-red-400 font-medium'}>
                    {c.status === 'approved' ? '✓ Approved' : '✕ Rejected'}
                  </p>
                  <p className="text-slate-700 dark:text-zinc-300">{c.summary}</p>
                  <p className="text-slate-500 dark:text-zinc-500">
                    {c.decided_by} — {c.decided_at ? new Date(c.decided_at).toLocaleString() : ''}
                  </p>
                  {c.last_error && <p className="text-red-500 dark:text-red-400">{c.last_error}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
