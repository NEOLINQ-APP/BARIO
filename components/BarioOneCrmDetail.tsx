'use client'

import { useEffect, useState } from 'react'

type Data = {
  customer: { id: string; company_name: string | null; contact_name: string; phone: string | null; email: string | null; address: string | null; tags: string[] }
  deals: { id: string; title: string; stage: string; value_cents: number }[]
  tasks: { id: string; title: string; status: string; due_at: string | null }[]
  notes: { id: string; kind: 'note' | 'email' | 'sms'; body: string; created_at: string; author_email: string | null }[]
} | null

const KIND_LABEL: Record<string, string> = { note: '📝 Note', email: '📧 Email', sms: '💬 SMS' }

function SendBox({ customerId, hasEmail, hasPhone, onSent }: { customerId: string; hasEmail: boolean; hasPhone: boolean; onSent: () => void }) {
  const [mode, setMode] = useState<'note' | 'email' | 'sms'>('note')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const path =
        mode === 'note'
          ? `/api/bario-one/crm/customers/${customerId}/notes`
          : mode === 'email'
          ? `/api/bario-one/crm/customers/${customerId}/email`
          : `/api/bario-one/crm/customers/${customerId}/sms`
      const payload = mode === 'note' ? { body } : mode === 'email' ? { subject, body } : { body }
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setSubject('')
      setBody('')
      onSent()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSend} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3">
      <div className="flex gap-2">
        {(['note', 'email', 'sms'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            disabled={(m === 'email' && !hasEmail) || (m === 'sms' && !hasPhone)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-40 ${mode === m ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800'}`}
          >
            {KIND_LABEL[m]}
          </button>
        ))}
      </div>
      {mode === 'email' && (
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" required className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        rows={3}
        placeholder={mode === 'note' ? 'Internal note…' : mode === 'email' ? 'Email message…' : 'Text message…'}
        className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
      />
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
        {busy ? 'Sending…' : mode === 'note' ? 'Add note' : `Send ${mode}`}
      </button>
    </form>
  )
}

export default function BarioOneCrmDetail({ customerId }: { customerId: string }) {
  const [data, setData] = useState<Data>(undefined as any)

  async function load() {
    const res = await fetch(`/api/bario-one/crm/customers/${customerId}`)
    if (!res.ok) {
      setData(null)
      return
    }
    setData(await res.json())
  }

  useEffect(() => {
    load()
  }, [customerId])

  if (data === undefined) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!data) return <p className="text-sm text-red-500 dark:text-red-400">Customer not found.</p>

  const { customer, deals, tasks, notes } = data

  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-4">
        <SendBox customerId={customerId} hasEmail={Boolean(customer.email)} hasPhone={Boolean(customer.phone)} onSent={load} />

        <div>
          <p className="text-sm font-semibold mb-2">History</p>
          <div className="space-y-2">
            {notes.length === 0 && <p className="text-xs text-slate-400">No activity yet.</p>}
            {notes.map((n) => (
              <div key={n.id} className="rounded-lg border border-slate-200 dark:border-zinc-800 p-3 text-sm">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 mb-1">
                  <span>{KIND_LABEL[n.kind]}{n.author_email ? ` — ${n.author_email}` : ''}</span>
                  <span>{new Date(n.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap">{n.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
          <h2 className="font-bold text-lg">{customer.contact_name}</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">{customer.company_name}</p>
          <div className="mt-3 space-y-1 text-sm">
            <p>📧 {customer.email || '—'}</p>
            <p>📞 {customer.phone || '—'}</p>
            <p>📍 {customer.address || '—'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
          <p className="text-sm font-semibold mb-2">Deals</p>
          {deals.length === 0 && <p className="text-xs text-slate-400">No deals yet.</p>}
          <ul className="space-y-1">
            {deals.map((d) => (
              <li key={d.id} className="text-sm flex justify-between">
                <span>{d.title}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 capitalize">{d.stage}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
          <p className="text-sm font-semibold mb-2">Tasks</p>
          {tasks.length === 0 && <p className="text-xs text-slate-400">No tasks yet.</p>}
          <ul className="space-y-1">
            {tasks.map((t) => (
              <li key={t.id} className="text-sm flex justify-between">
                <span className={t.status === 'done' ? 'line-through text-slate-400' : ''}>{t.title}</span>
                {t.due_at && <span className="text-xs text-slate-400">{new Date(t.due_at).toLocaleDateString()}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
