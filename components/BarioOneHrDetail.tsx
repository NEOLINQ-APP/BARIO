'use client'

import { useEffect, useRef, useState } from 'react'

type Data = {
  employee: {
    id: string
    name: string
    email: string | null
    phone: string | null
    position: string | null
    pay_type: 'hourly' | 'salary'
    salary_cents: number | null
    hourly_rate_cents: number | null
    status: string
    documents: { name: string; url: string }[]
  }
  timeEntries: { id: string; clock_in: string; clock_out: string | null }[]
  shifts: { id: string; starts_at: string; ends_at: string; notes: string | null }[]
  vacation: { id: string; start_date: string; end_date: string; status: string }[]
  notes: { id: string; body: string; created_at: string; author_email: string | null }[]
} | null

function hoursBetween(a: string, b: string) {
  return ((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60)).toFixed(2)
}

export default function BarioOneHrDetail({ employeeId }: { employeeId: string }) {
  const [data, setData] = useState<Data>(undefined as any)
  const [noteBody, setNoteBody] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const res = await fetch(`/api/bario-one/hr/employees/${employeeId}`)
    if (!res.ok) {
      setData(null)
      return
    }
    setData(await res.json())
  }

  useEffect(() => {
    load()
  }, [employeeId])

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteBody.trim()) return
    setNoteBusy(true)
    try {
      await fetch(`/api/bario-one/hr/employees/${employeeId}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: noteBody.trim() }),
      })
      setNoteBody('')
      await load()
    } finally {
      setNoteBusy(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploadBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/bario-one/hr/employees/${employeeId}/documents`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      await load()
    } catch (err: any) {
      setUploadError(err.message)
    } finally {
      setUploadBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (data === undefined) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!data) return <p className="text-sm text-red-500 dark:text-red-400">Not found.</p>

  const { employee, timeEntries, shifts, vacation, notes } = data

  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
          <p className="text-sm font-semibold mb-2">Time entries</p>
          {timeEntries.length === 0 && <p className="text-xs text-slate-400">No time entries yet.</p>}
          <ul className="space-y-1">
            {timeEntries.map((t) => (
              <li key={t.id} className="flex justify-between text-sm">
                <span>{new Date(t.clock_in).toLocaleString()} → {t.clock_out ? new Date(t.clock_out).toLocaleTimeString() : 'still clocked in'}</span>
                {t.clock_out && <span className="text-xs text-slate-500 dark:text-zinc-400">{hoursBetween(t.clock_in, t.clock_out)}h</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
          <p className="text-sm font-semibold mb-2">Upcoming shifts</p>
          {shifts.length === 0 && <p className="text-xs text-slate-400">None scheduled.</p>}
          <ul className="space-y-1">
            {shifts.map((s) => (
              <li key={s.id} className="text-sm">{new Date(s.starts_at).toLocaleString()} – {new Date(s.ends_at).toLocaleTimeString()}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
          <p className="text-sm font-semibold mb-2">Vacation</p>
          {vacation.length === 0 && <p className="text-xs text-slate-400">No requests.</p>}
          <ul className="space-y-1">
            {vacation.map((v) => (
              <li key={v.id} className="flex justify-between text-sm">
                <span>{v.start_date.slice(0, 10)} – {v.end_date.slice(0, 10)}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 capitalize">{v.status}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3">
          <p className="text-sm font-semibold">Notes</p>
          <form onSubmit={addNote} className="flex gap-2">
            <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add a note…" className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
            <button type="submit" disabled={noteBusy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">Add</button>
          </form>
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="text-sm border-t border-slate-100 dark:border-zinc-900 pt-2">
                <p>{n.body}</p>
                <p className="text-xs text-slate-400">{n.author_email} — {new Date(n.created_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
          <h2 className="font-bold text-lg">{employee.name}</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">{employee.position}</p>
          <div className="mt-3 space-y-1 text-sm">
            <p>📧 {employee.email || '—'}</p>
            <p>📞 {employee.phone || '—'}</p>
            <p>💰 {employee.pay_type === 'hourly' ? `$${((employee.hourly_rate_cents ?? 0) / 100).toFixed(2)}/hr` : `$${((employee.salary_cents ?? 0) / 100).toLocaleString()}/yr`}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-2">
          <p className="text-sm font-semibold">Documents</p>
          {employee.documents.length === 0 && <p className="text-xs text-slate-400">None uploaded.</p>}
          <ul className="space-y-1">
            {employee.documents.map((d, i) => (
              <li key={i}>
                <a href={d.url} target="_blank" rel="noreferrer" className="text-sm text-amber-600 dark:text-[#d4af37] hover:underline">{d.name}</a>
              </li>
            ))}
          </ul>
          <input ref={fileRef} type="file" onChange={handleUpload} disabled={uploadBusy} className="text-xs" />
          {uploadError && <p className="text-xs text-red-500 dark:text-red-400">{uploadError}</p>}
        </div>
      </div>
    </div>
  )
}
