'use client'

import { useEffect, useState } from 'react'

type BarioUser = { id: string; email: string; plan: string | null }

export default function ShareInvoiceModal({
  invoiceId,
  invoiceNumber,
  publicUrl,
  totalDisplay,
  clientEmail,
  clientPhone,
  onSent,
  onClose,
}: {
  invoiceId: string
  invoiceNumber: string
  publicUrl: string
  totalDisplay: string
  clientEmail: string | null
  clientPhone: string | null
  onSent: () => void
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BarioUser[]>([])
  const [searching, setSearching] = useState(false)
  const [otherEmail, setOtherEmail] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canNativeShare, setCanNativeShare] = useState(false)

  const shareText = `${invoiceNumber} — ${totalDisplay}: ${publicUrl}`

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const handle = setTimeout(() => {
      fetch(`/api/admin/users/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => r.json())
        .then((data) => setResults(data.ok ? data.users : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(handle)
  }, [query])

  async function sendEmail(to: string | null) {
    setSending(to ?? 'client')
    setError(null)
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(to ? { to } : {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not send')
      onSent()
    } catch (err: any) {
      setError(err.message)
    }
    setSending(null)
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const phoneDigits = clientPhone?.replace(/[^\d+]/g, '') ?? ''
  const whatsappUrl = phoneDigits
    ? `https://wa.me/${phoneDigits.replace(/^\+/, '')}?text=${encodeURIComponent(shareText)}`
    : `https://wa.me/?text=${encodeURIComponent(shareText)}`
  const signalUrl = phoneDigits ? `https://signal.me/#p/${phoneDigits}` : null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-6" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 rounded-2xl max-w-md w-full my-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800">
          <p className="font-semibold">Share {invoiceNumber}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 text-lg leading-none">✕</button>
        </div>

        <div className="p-6 space-y-5 text-sm">
          <div>
            <button
              onClick={copyLink}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-left flex items-center justify-between"
            >
              <span className="truncate">{publicUrl}</span>
              <span className="text-cyan-600 dark:text-cyan-400 font-medium ml-2 shrink-0">{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-center"
            >
              WhatsApp
            </a>
            {signalUrl ? (
              <a href={signalUrl} target="_blank" rel="noreferrer" className="px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-center">
                Signal
              </a>
            ) : (
              <button
                disabled
                title="Add a client phone number to enable Signal"
                className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-center opacity-40 cursor-not-allowed"
              >
                Signal
              </button>
            )}
            {canNativeShare && (
              <button
                onClick={() => (navigator as any).share({ title: invoiceNumber, text: shareText, url: publicUrl }).catch(() => {})}
                className="px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-center col-span-2"
              >
                Share to other apps…
              </button>
            )}
          </div>
          {signalUrl === null && (
            <p className="text-xs text-slate-500 dark:text-zinc-500 -mt-3">Signal doesn't support pre-filled message text — it'll just open a chat with the link ready to paste.</p>
          )}

          <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Email</p>
            {clientEmail && (
              <button
                onClick={() => sendEmail(null)}
                disabled={sending !== null}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 text-left disabled:opacity-50"
              >
                {sending === 'client' ? 'Sending…' : `Send to ${clientEmail} (this invoice's client)`}
              </button>
            )}

            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a Bario customer by email…"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
              {(searching || results.length > 0) && (
                <div className="mt-1 rounded-lg border border-slate-200 dark:border-zinc-800 divide-y divide-slate-100 dark:divide-zinc-900 max-h-40 overflow-y-auto">
                  {searching && <p className="px-3 py-2 text-xs text-slate-500 dark:text-zinc-500">Searching…</p>}
                  {results.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => sendEmail(u.email)}
                      disabled={sending !== null}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-zinc-900 disabled:opacity-50 text-xs"
                    >
                      {sending === u.email ? 'Sending…' : `${u.email}${u.plan ? ` (${u.plan})` : ''}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="email"
                value={otherEmail}
                onChange={(e) => setOtherEmail(e.target.value)}
                placeholder="Or type any email address…"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
              <button
                onClick={() => sendEmail(otherEmail)}
                disabled={sending !== null || !otherEmail.trim()}
                className="px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs"
              >
                {sending === otherEmail ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  )
}
