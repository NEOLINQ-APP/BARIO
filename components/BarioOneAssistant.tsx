'use client'

import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

const GREETING: Msg = {
  role: 'assistant',
  content:
    "Hi — I'm Bario AI. Ask me things like \"who owes money?\", \"what were my sales this month?\", \"find my top customers\", or tell me to draft an invoice or schedule a shift.",
}

const SUGGESTIONS = ['Who owes money?', 'What were my sales this month?', 'Find my top customers', 'Any products running low on stock?']

export default function BarioOneAssistant() {
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user', content } as Msg]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${err.message ?? 'something went wrong'}` }])
    }
    setBusy(false)
  }

  return (
    <div className="max-w-2xl">
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} className="text-xs rounded-full border border-slate-300 dark:border-zinc-700 px-3 py-1.5 hover:border-amber-500 dark:hover:border-[#d4af37]">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] flex flex-col h-[28rem]">
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`text-sm max-w-[85%] px-3 py-2 rounded-xl whitespace-pre-wrap ${
                m.role === 'user' ? 'ml-auto bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200'
              }`}
            >
              {m.content}
            </div>
          ))}
          {busy && <div className="text-xs text-slate-400 animate-pulse">Working…</div>}
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
            placeholder="Ask Bario AI…"
            disabled={busy}
            className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
