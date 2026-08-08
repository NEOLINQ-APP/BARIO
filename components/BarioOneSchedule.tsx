'use client'

import { useEffect, useState } from 'react'

type Shift = { id: string; employee_id: string; employee_name: string; starts_at: string; ends_at: string; notes: string | null }
type EmployeeOption = { id: string; name: string }

function AddShiftForm({ employees, onAdded }: { employees: EmployeeOption[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/hr/shifts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId, startsAt, endsAt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setStartsAt('')
      setEndsAt('')
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
        + Schedule a shift
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4 max-w-lg">
      <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
        <option value="">Select employee…</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Starts</label>
          <input required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Ends</label>
          <input required type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        </div>
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Save shift'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

export default function BarioOneSchedule() {
  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])

  async function load() {
    const res = await fetch('/api/bario-one/hr/shifts')
    const data = await res.json()
    setShifts(data.shifts ?? [])
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

  async function removeShift(id: string) {
    setShifts((prev) => prev?.filter((s) => s.id !== id) ?? null)
    await fetch(`/api/bario-one/hr/shifts/${id}`, { method: 'DELETE' })
  }

  if (shifts === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  return (
    <div>
      <AddShiftForm employees={employees} onAdded={load} />
      {shifts.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Nothing scheduled.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {shifts.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-semibold">{s.employee_name}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {new Date(s.starts_at).toLocaleString()} – {new Date(s.ends_at).toLocaleTimeString()}
                </p>
              </div>
              <button onClick={() => removeShift(s.id)} className="text-red-500 hover:underline text-xs">Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
