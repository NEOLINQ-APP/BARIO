'use client'

import { useEffect, useState } from 'react'

type VacationRequest = { id: string; employee_id: string; employee_name: string; start_date: string; end_date: string; status: string; notes: string | null }
type EmployeeOption = { id: string; name: string }

function FileRequestForm({ employees, onAdded }: { employees: EmployeeOption[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/hr/vacation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId: employeeId || undefined, startDate, endDate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setStartDate('')
      setEndDate('')
      setOpen(false)
      onAdded()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 mb-4">
        + File a request
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4 max-w-lg">
      {employees.length > 0 && (
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          <option value="">For myself</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Submit request'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

export default function BarioOneVacation() {
  const [requests, setRequests] = useState<VacationRequest[] | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])

  async function load() {
    const res = await fetch('/api/bario-one/hr/vacation')
    const data = await res.json()
    setRequests(data.requests ?? [])
  }

  async function loadEmployees() {
    const res = await fetch('/api/bario-one/hr/employees')
    const data = await res.json()
    setEmployees((data.employees ?? []).map((e: any) => ({ id: e.id, name: e.name })))
  }

  useEffect(() => {
    load()
    loadEmployees()
  }, [])

  async function decide(id: string, status: 'approved' | 'denied') {
    setRequests((prev) => prev?.map((r) => (r.id === id ? { ...r, status } : r)) ?? null)
    await fetch(`/api/bario-one/hr/vacation/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  if (requests === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  return (
    <div>
      <FileRequestForm employees={employees} onAdded={load} />
      {requests.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No requests yet.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-semibold">{r.employee_name}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{r.start_date.slice(0, 10)} – {r.end_date.slice(0, 10)}</p>
              </div>
              {r.status === 'pending' ? (
                <div className="flex gap-2">
                  <button onClick={() => decide(r.id, 'approved')} className="text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5">Approve</button>
                  <button onClick={() => decide(r.id, 'denied')} className="text-xs rounded-lg bg-slate-200 dark:bg-zinc-800 px-3 py-1.5">Deny</button>
                </div>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${r.status === 'approved' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'}`}>
                  {r.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
