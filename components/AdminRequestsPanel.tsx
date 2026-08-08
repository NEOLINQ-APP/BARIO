'use client'

import { useEffect, useState } from 'react'

type ClientRequest = {
  id: string
  company_key: string
  title: string
  description: string
  status: string
  priority: number
  estimated_hours: string | number | null
  estimated_completion_at: string | null
  estimate_reasoning: string | null
  created_at: string
  updated_at: string
}

type RequestEvent = {
  id: string
  actor: string
  actor_label: string
  event_type: string
  message: string | null
  created_at: string
}

const COMPANY_LABELS: Record<string, string> = { afc_logistics: 'AFC Logistics', sunbuilt_group: 'Sunbuilt Group' }
const STATUSES = ['new', 'in_progress', 'blocked', 'done', 'cancelled']

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' MT'
}

export default function AdminRequestsPanel() {
  const [requests, setRequests] = useState<ClientRequest[] | null>(null)
  const [closed, setClosed] = useState<ClientRequest[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [events, setEvents] = useState<RequestEvent[] | null>(null)
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await fetch('/api/admin/requests')
    const data = await res.json()
    if (res.ok) {
      setRequests(data.requests)
      setClosed(data.closed)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function openItem(r: ClientRequest) {
    if (openId === r.id) {
      setOpenId(null)
      setEvents(null)
      return
    }
    setOpenId(r.id)
    setStatus(r.status)
    setPriority(r.priority)
    setNote('')
    setEvents(null)
    const res = await fetch(`/api/admin/requests/${r.id}`)
    const data = await res.json()
    if (res.ok) setEvents(data.events)
  }

  async function save(id: string) {
    setSaving(true)
    try {
      await fetch(`/api/admin/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, priority: Number(priority), note: note || undefined }),
      })
      setNote('')
      await load()
      const res = await fetch(`/api/admin/requests/${id}`)
      const data = await res.json()
      if (res.ok) setEvents(data.events)
    } finally {
      setSaving(false)
    }
  }

  function renderRow(r: ClientRequest) {
    return (
      <div key={r.id} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a]">
        <button onClick={() => openItem(r)} className="w-full text-left p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">{COMPANY_LABELS[r.company_key] ?? r.company_key} · priority {r.priority}</div>
            <div className="font-semibold">{r.title}</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{r.status} · ETA {formatDate(r.estimated_completion_at)} · {r.estimated_hours ?? '?'}h</div>
          </div>
          <span className="text-slate-400">{openId === r.id ? '▲' : '▼'}</span>
        </button>
        {openId === r.id && (
          <div className="border-t border-slate-200 dark:border-zinc-800 p-4 space-y-3">
            <p className="text-sm text-slate-600 dark:text-zinc-300">{r.description}</p>
            {r.estimate_reasoning && <p className="text-xs italic text-slate-500 dark:text-zinc-500">{r.estimate_reasoning}</p>}

            <div className="space-y-2">
              {events === null && <p className="text-xs text-slate-500">Loading timeline…</p>}
              {events?.map((ev) => (
                <div key={ev.id} className="text-xs border-l-2 border-slate-200 dark:border-zinc-700 pl-3">
                  <span className="font-semibold">{ev.actor_label}</span>{' '}
                  <span className="text-slate-500 dark:text-zinc-500">{formatDate(ev.created_at)}</span>
                  {ev.message && <div className="text-slate-600 dark:text-zinc-300">{ev.message}</div>}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1.5 text-sm">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-20 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1.5 text-sm"
                title="Priority (lower = sooner)"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note to client (optional)"
                className="flex-1 min-w-[160px] rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1.5 text-sm"
              />
              <button
                onClick={() => save(r.id)}
                disabled={saving}
                className="rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="font-bold text-lg">Open queue</h2>
        {requests === null && <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>}
        {requests?.length === 0 && <p className="text-sm text-slate-500 dark:text-zinc-400">Nothing open.</p>}
        {requests?.map(renderRow)}
      </div>
      <div className="space-y-3">
        <h2 className="font-bold text-lg">Recently closed</h2>
        {closed?.length === 0 && <p className="text-sm text-slate-500 dark:text-zinc-400">Nothing closed yet.</p>}
        {closed?.map(renderRow)}
      </div>
    </div>
  )
}
