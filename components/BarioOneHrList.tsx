'use client'

import { useEffect, useState } from 'react'

type Employee = { id: string; name: string; position: string | null; pay_type: 'salary' | 'hourly'; salary_cents: number | null; hourly_rate_cents: number | null; status: string }
type ClockStatus = { employees: { id: string; name: string; clockedIn: boolean; clockInAt: string | null }[]; myEmployeeId: string | null }

function AddEmployeeForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [payType, setPayType] = useState<'hourly' | 'salary'>('hourly')
  const [rate, setRate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/hr/employees', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          position,
          email,
          phone,
          payType,
          hourlyRateCents: payType === 'hourly' ? Math.round(Number(rate) * 100) : undefined,
          salaryCents: payType === 'salary' ? Math.round(Number(rate) * 100) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setName('')
      setPosition('')
      setEmail('')
      setPhone('')
      setRate('')
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
      <button onClick={() => setOpen(true)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2">
        + Add employee
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Position" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <select value={payType} onChange={(e) => setPayType(e.target.value as any)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          <option value="hourly">Hourly</option>
          <option value="salary">Salary</option>
        </select>
        <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" min="0" step="0.01" placeholder={payType === 'hourly' ? 'Rate $/hr' : 'Annual salary $'} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Save employee'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

function ClockWidget() {
  const [status, setStatus] = useState<ClockStatus | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch('/api/bario-one/hr/time')
    setStatus(await res.json())
  }

  useEffect(() => {
    load()
  }, [])

  async function toggle(mine: boolean, clockedIn: boolean) {
    setBusy(true)
    try {
      await fetch(`/api/bario-one/hr/time/${clockedIn ? 'clock-out' : 'clock-in'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null
  const me = status.employees.find((e) => e.id === status.myEmployeeId)

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3">
      {me && (
        <div className="flex items-center justify-between">
          <p className="text-sm">You're currently {me.clockedIn ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">clocked in</span> : 'clocked out'}</p>
          <button onClick={() => toggle(true, me.clockedIn)} disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
            {me.clockedIn ? 'Clock out' : 'Clock in'}
          </button>
        </div>
      )}
      <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Who's on the clock</p>
      <ul className="space-y-1">
        {status.employees.map((e) => (
          <li key={e.id} className="flex items-center justify-between text-sm">
            <span>{e.name}</span>
            {e.clockedIn ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                Clocked in {e.clockInAt ? new Date(e.clockInAt).toLocaleTimeString() : ''}
              </span>
            ) : (
              <span className="text-xs text-slate-400">Off the clock</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function BarioOneHrList() {
  const [employees, setEmployees] = useState<Employee[] | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/hr/employees')
    const data = await res.json()
    setEmployees(data.employees ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AddEmployeeForm onAdded={load} />
        <div className="flex gap-2">
          <a href="/dashboard/bario-one/hr/schedule" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline self-center">Schedule →</a>
          <a href="/dashboard/bario-one/hr/vacation" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline self-center">Vacation →</a>
        </div>
      </div>

      <ClockWidget />

      {employees === null ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : employees.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No employees yet — add your first one above.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {employees.map((e) => (
            <a key={e.id} href={`/dashboard/bario-one/hr/${e.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-zinc-900">
              <div>
                <p className="font-semibold text-sm">{e.name}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{e.position || '—'}</p>
              </div>
              <div className="text-right text-xs text-slate-500 dark:text-zinc-400">
                {e.pay_type === 'hourly' ? `$${((e.hourly_rate_cents ?? 0) / 100).toFixed(2)}/hr` : `$${((e.salary_cents ?? 0) / 100).toLocaleString()}/yr`}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
