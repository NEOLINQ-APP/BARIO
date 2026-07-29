'use client'

import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

const GREETING: Msg = {
  role: 'assistant',
  content: "Hi! 👋 Need a hand with anything in your account? Ask away.",
}

export default function SupportAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportMessage, setReportMessage] = useState('')
  const [reportStatus, setReportStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function send(text: string) {
    if (!text.trim() || busy) return
    const next = [...messages, { role: 'user', content: text } as Msg]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/assistant/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Sorry, something went wrong on my end — mind trying again?' }])
    }
    setBusy(false)
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('folder', 'support-uploads')
      const res = await fetch('/api/media', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      await send(`I've attached a file for this: ${data.url} (filename: ${file.name})`)
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Couldn't upload that file — ${err.message ?? 'please try again'}.` }])
    }
    setUploading(false)
  }

  async function submitReport() {
    if (!reportMessage.trim() || reportStatus === 'sending') return
    setReportStatus('sending')
    try {
      const res = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: reportMessage.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      setReportStatus('sent')
      setReportMessage('')
    } catch {
      setReportStatus('error')
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 w-80 sm:w-96 h-[30rem] rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-xl dark:shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Bario Support</div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Guidance for your account</div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setReportOpen((o) => !o)} className="text-[11px] text-slate-500 dark:text-zinc-400 hover:text-[#f59e0b] underline">
                Report an issue
              </button>
              <button onClick={() => setOpen(false)} className="text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white text-lg leading-none">✕</button>
            </div>
          </div>

          {reportOpen ? (
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Describe the issue and it'll go straight to the team — refunds/billing disputes are reviewed by an admin and take 24–72 hours.
              </p>
              <textarea
                value={reportMessage}
                onChange={(e) => setReportMessage(e.target.value)}
                placeholder="What's going on?"
                rows={5}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 resize-none"
              />
              {reportStatus === 'sent' ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Sent — thanks, we'll follow up by email.</p>
              ) : (
                <>
                  {reportStatus === 'error' && <p className="text-xs text-red-500 dark:text-red-400">Couldn't send that — try again?</p>}
                  <button
                    onClick={submitReport}
                    disabled={!reportMessage.trim() || reportStatus === 'sending'}
                    className="px-3 py-2 rounded-xl bg-[#f59e0b] text-[#1a1200] text-sm font-semibold disabled:opacity-50"
                  >
                    {reportStatus === 'sending' ? 'Sending…' : 'Send report'}
                  </button>
                </>
              )}
              <button onClick={() => setReportOpen(false)} className="text-xs text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 mt-1">
                ← Back to chat
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`text-sm max-w-[85%] px-3 py-2 rounded-xl whitespace-pre-wrap ${
                      m.role === 'user' ? 'ml-auto bg-[#f59e0b] text-[#1a1200]' : 'bg-slate-100 dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-800'
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {(busy || uploading) && (
                  <div className="text-sm bg-slate-100 dark:bg-[#0b111c] border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 px-3 py-2 rounded-xl max-w-[85%]">
                    {uploading ? 'Uploading…' : 'Typing…'}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  send(input)
                }}
                className="p-3 border-t border-slate-200 dark:border-zinc-800 flex items-center gap-2"
              >
                <input ref={fileRef} type="file" onChange={handleFilePick} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy || uploading}
                  title="Attach a file (e.g. a billing receipt)"
                  className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 text-sm disabled:opacity-50"
                >
                  📎
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask how to do something…"
                  disabled={busy}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="px-3 py-2 rounded-xl bg-[#f59e0b] text-[#1a1200] text-sm font-semibold disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-14 h-14 rounded-full bg-[#f59e0b] text-[#1a1200] shadow-2xl flex items-center justify-center text-2xl hover:scale-105 transition-transform"
        aria-label="Chat with Bario support"
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  )
}
