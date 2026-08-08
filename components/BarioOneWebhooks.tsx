'use client'

import { useEffect, useState } from 'react'

type Webhook = { id: string; url: string; eventTypes: string[]; status: string; createdAt: string }
type Delivery = { id: string; eventType: string; responseStatus: number | null; success: boolean; error: string | null; createdAt: string }

const EVENT_OPTIONS = [
  { value: 'invoice.created', label: 'Invoice created' },
  { value: 'invoice.sent', label: 'Invoice sent' },
  { value: 'invoice.paid', label: 'Invoice paid' },
  { value: 'customer.created', label: 'Customer created' },
  { value: 'pos_sale.completed', label: 'POS sale completed' },
  { value: 'shift.scheduled', label: 'Shift scheduled' },
]

function AddWebhookForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newSecret, setNewSecret] = useState<string | null>(null)

  function toggleEvent(v: string) {
    setEvents((prev) => (prev.includes(v) ? prev.filter((e) => e !== v) : [...prev, v]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/webhooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, eventTypes: events }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setNewSecret(data.secret)
      setUrl('')
      setEvents([])
      onAdded()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (newSecret) {
    return (
      <div className="rounded-xl border border-amber-500/40 dark:border-[#d4af37]/40 bg-amber-500/5 dark:bg-[#d4af37]/5 p-4 text-sm space-y-2 mb-4">
        <p className="font-semibold text-amber-700 dark:text-[#d4af37]">Webhook created. Copy this signing secret now — it won&apos;t be shown again.</p>
        <code className="block bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs break-all select-all">{newSecret}</code>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Every delivery includes an <code>X-Bario-Signature</code> header — HMAC-SHA256 of the raw request body, using this secret. Verify it before trusting the payload.
        </p>
        <button onClick={() => setNewSecret(null)} className="text-xs text-slate-500 dark:text-zinc-400 hover:underline">Done, dismiss</button>
      </div>
    )
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 mb-4">+ Add webhook</button>
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4">
      <input required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-endpoint.example.com/webhook" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <div>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-2">Send this webhook for:</p>
        <div className="flex flex-wrap gap-2">
          {EVENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleEvent(opt.value)}
              className={`text-xs rounded-full px-3 py-1.5 border ${events.includes(opt.value) ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-300 dark:border-zinc-700'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">Save</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

function WebhookRow({ webhook, onRemoved }: { webhook: Webhook; onRemoved: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null)

  async function toggleExpand() {
    setExpanded((e) => !e)
    if (!deliveries) {
      const res = await fetch(`/api/bario-one/webhooks/${webhook.id}/deliveries`)
      const data = await res.json()
      setDeliveries(data.deliveries ?? [])
    }
  }

  async function remove() {
    await fetch(`/api/bario-one/webhooks?id=${webhook.id}`, { method: 'DELETE' })
    onRemoved()
  }

  return (
    <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium break-all">{webhook.url}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400">{webhook.eventTypes.join(', ')}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={toggleExpand} className="text-xs text-amber-600 dark:text-[#d4af37] hover:underline">
            {expanded ? 'Hide log' : 'View log'}
          </button>
          <button onClick={remove} className="text-xs text-red-600 dark:text-red-400 hover:underline">Remove</button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-900 space-y-1">
          {deliveries === null && <p className="text-xs text-slate-400">Loading…</p>}
          {deliveries?.length === 0 && <p className="text-xs text-slate-400">No deliveries yet.</p>}
          {deliveries?.map((d) => (
            <div key={d.id} className="text-xs flex items-center justify-between">
              <span>{d.eventType}</span>
              <span className={d.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
                {d.success ? `✓ ${d.responseStatus}` : `✗ ${d.error ?? d.responseStatus ?? 'failed'}`}
              </span>
              <span className="text-slate-400">{new Date(d.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BarioOneWebhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/webhooks')
    const data = await res.json()
    setWebhooks(data.webhooks ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-slate-500 dark:text-zinc-400">
        Get a real-time HTTP POST whenever something happens — connect to Zapier, Make, n8n, or your own endpoint.
      </p>
      <AddWebhookForm onAdded={load} />
      {webhooks === null ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : webhooks.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No webhooks yet.</p>
      ) : (
        <div className="space-y-2">
          {webhooks.map((w) => (
            <WebhookRow key={w.id} webhook={w} onRemoved={load} />
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-2">
        <p className="text-sm font-semibold">Export to CSV</p>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-2">For accounting software that just wants a file (QuickBooks, Xero, Wave all accept CSV import).</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/bario-one/export/customers" className="text-xs rounded-lg border border-slate-300 dark:border-zinc-700 px-3 py-1.5 hover:border-amber-500 dark:hover:border-[#d4af37]">Customers</a>
          <a href="/api/bario-one/export/invoices" className="text-xs rounded-lg border border-slate-300 dark:border-zinc-700 px-3 py-1.5 hover:border-amber-500 dark:hover:border-[#d4af37]">Invoices</a>
          <a href="/api/bario-one/export/sales" className="text-xs rounded-lg border border-slate-300 dark:border-zinc-700 px-3 py-1.5 hover:border-amber-500 dark:hover:border-[#d4af37]">POS Sales</a>
        </div>
      </div>
    </div>
  )
}
