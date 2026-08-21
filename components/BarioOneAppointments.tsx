'use client'

import { useEffect, useState } from 'react'

type Appointment = {
  id: string
  title: string
  location: string | null
  starts_at: string
  status: 'scheduled' | 'completed' | 'canceled' | 'no_show'
  contact_name: string | null
}

const STATUS_STYLE: Record<Appointment['status'], string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  canceled: 'bg-slate-200 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400',
  no_show: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
}

function AddAppointmentForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await fetch('/api/bario-one/appointments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, startsAt: new Date(startsAt).toISOString(), location: location || undefined }),
      })
      setTitle('')
      setStartsAt('')
      setLocation('')
      onAdded()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 flex flex-wrap gap-2 mb-4">
      <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New appointment…" className="flex-1 min-w-[200px] rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <input required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} type="datetime-local" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
        Add
      </button>
    </form>
  )
}

export default function BarioOneAppointments() {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/appointments')
    const data = await res.json()
    setAppointments(data.appointments ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function setStatus(id: string, status: Appointment['status']) {
    setAppointments((prev) => prev?.map((a) => (a.id === id ? { ...a, status } : a)) ?? null)
    await fetch(`/api/bario-one/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  if (appointments === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  return (
    <div>
      <AddAppointmentForm onAdded={load} />
      {appointments.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No appointments yet.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {appointments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.title}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {new Date(a.starts_at).toLocaleString()}
                  {a.location ? ` · ${a.location}` : ''}
                  {a.contact_name ? ` · ${a.contact_name}` : ''}
                </p>
              </div>
              <select
                value={a.status}
                onChange={(e) => setStatus(a.id, e.target.value as Appointment['status'])}
                className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium border-0 ${STATUS_STYLE[a.status]}`}
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
                <option value="no_show">No-show</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
