'use client'

import { useEffect, useState } from 'react'

type ClientRequest = {
  id: string
  title: string
  description: string
  status: string
  estimated_hours: string | number | null
  estimated_completion_at: string | null
  estimate_reasoning: string | null
  created_at: string
}

type RequestEvent = {
  id: string
  actor: string
  actor_label: string
  event_type: string
  message: string | null
  created_at: string
}

const STATUS_LABEL: Record<string, string> = {
  new: '🆕 New',
  in_progress: '🔧 In progress',
  blocked: '⛔ Blocked',
  done: '✅ Done',
  cancelled: '⚪ Cancelled',
}

function formatEta(iso: string | null) {
  if (!iso) return 'Estimating…'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Edmonton',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }) + ' MT'
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Edmonton',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }) + ' MT'
}

export default function RequestsPanel() {
  const [requests, setRequests] = useState<ClientRequest[] | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [openId, setOpenId] = useState<string | null>(null)
  const [events, setEvents] = useState<RequestEvent[] | null>(null)
  const [comment, setComment] = useState('')
  const [commenting, setCommenting] = useState(false)

  async function loadRequests() {
    const res = await fetch('/api/dashboard/requests')
    const data = await res.json()
    if (res.ok) setRequests(data.requests)
  }

  useEffect(() => {
    loadRequests()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim() || !description.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/dashboard/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit request')
      setTitle('')
      setDescription('')
      await loadRequests()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function openTimeline(id: string) {
    if (openId === id) {
      setOpenId(null)
      setEvents(null)
      return
    }
    setOpenId(id)
    setEvents(null)
    const res = await fetch(`/api/dashboard/requests/${id}`)
    const data = await res.json()
    if (res.ok) setEvents(data.events)
  }

  async function submitComment(id: string) {
    if (!comment.trim()) return
    setCommenting(true)
    try {
      await fetch(`/api/dashboard/requests/${id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: comment }),
      })
      setComment('')
      const res = await fetch(`/api/dashboard/requests/${id}`)
      const data = await res.json()
      if (res.ok) setEvents(data.events)
    } finally {
      setCommenting(false)
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-6 space-y-4">
        <h2 className="font-bold text-lg">New request</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short title (e.g. 'Add a gallery photo')"
          className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what you'd like done..."
          rows={4}
          className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </form>

      <div className="space-y-3">
        <h2 className="font-bold text-lg">Your requests</h2>
        {requests === null && <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>}
        {requests?.length === 0 && <p className="text-sm text-slate-500 dark:text-zinc-400">No requests yet — submit one above.</p>}
        {requests?.map((r) => (
          <div key={r.id} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none">
            <button onClick={() => openTimeline(r.id)} className="w-full text-left p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">{r.title}</div>
                <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {STATUS_LABEL[r.status] || r.status} · ETA: {formatEta(r.estimated_completion_at)}
                </div>
              </div>
              <span className="text-slate-400">{openId === r.id ? '▲' : '▼'}</span>
            </button>
            {openId === r.id && (
              <div className="border-t border-slate-200 dark:border-zinc-800 p-4 space-y-3">
                <p className="text-sm text-slate-600 dark:text-zinc-300">{r.description}</p>
                {r.estimate_reasoning && (
                  <p className="text-xs text-slate-500 dark:text-zinc-500 italic">{r.estimate_reasoning}</p>
                )}
                <div className="space-y-2">
                  {events === null && <p className="text-xs text-slate-500">Loading timeline…</p>}
                  {events?.map((ev) => (
                    <div key={ev.id} className="text-xs border-l-2 border-slate-200 dark:border-zinc-700 pl-3">
                      <span className="font-semibold">{ev.actor_label}</span>{' '}
                      <span className="text-slate-500 dark:text-zinc-500">{formatTimestamp(ev.created_at)}</span>
                      {ev.message && <div className="text-slate-600 dark:text-zinc-300">{ev.message}</div>}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a reply…"
                    className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => submitComment(r.id)}
                    disabled={commenting}
                    className="rounded-lg bg-slate-800 dark:bg-zinc-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
