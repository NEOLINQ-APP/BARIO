'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'
import PayrollSettings from '@/components/PayrollSettings'

type StaffRow = {
  id: string
  name: string
  email: string | null
  province: string
  pay_type: 'hourly' | 'salary'
  pay_rate_cents: number
  pay_frequency: string
  status: string
}

const PROVINCE_OPTIONS = [
  ['AB', 'Alberta ✓ verified'], ['BC', 'British Columbia'], ['SK', 'Saskatchewan'], ['MB', 'Manitoba'],
  ['ON', 'Ontario'], ['QC', 'Quebec'], ['NB', 'New Brunswick'], ['NS', 'Nova Scotia'],
  ['PE', 'Prince Edward Island'], ['NL', 'Newfoundland and Labrador'], ['YT', 'Yukon'], ['NT', 'Northwest Territories'], ['NU', 'Nunavut'],
]

export default function AdminPayroll() {
  const [staff, setStaff] = useState<StaffRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', province: 'AB', payType: 'hourly', payRate: '', payFrequency: 'biweekly' })
  const [creating, setCreating] = useState(false)

  function load() {
    fetch('/api/admin/staff')
      .then((r) => r.json())
      .then((data) => (data.ok ? setStaff(data.staff) : setError(data.error)))
      .catch((err) => setError(err.message))
  }
  useEffect(load, [])

  async function createStaff(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, payRateCents: Math.round(Number(form.payRate) * 100) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not add staff member')
      setForm({ name: '', email: '', province: 'AB', payType: 'hourly', payRate: '', payFrequency: 'biweekly' })
      setShowForm(false)
      load()
    } catch (err: any) {
      alert(err.message)
    }
    setCreating(false)
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Payroll</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Staff roster and paystubs, with CPP/CPP2/EI + tax withholding.</p>
            <div className="flex gap-3">
              <a href="/admin" className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline">← Admin</a>
              <a href="/admin/invoices/amber" className="text-xs text-amber-600 dark:text-amber-400 hover:underline">💬 Ask Amber a payroll question</a>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <div className="rounded-xl border border-amber-400/40 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Federal tax brackets, CPP/CPP2/EI, and Alberta's provincial tax are real 2026 CRA figures. Every other province currently uses a placeholder rate — verify against CRA's PDOC (canada.ca/pdoc) before relying on any non-Alberta paystub for real payroll.
        </div>

        <PayrollSettings />

        <button onClick={() => setShowForm((s) => !s)} className="px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm">
          {showForm ? 'Cancel' : '+ Add staff member'}
        </button>

        {showForm && (
          <form onSubmit={createStaff} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5 space-y-3">
            <input required placeholder="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <select value={form.province} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm">
                {PROVINCE_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
              <select value={form.payFrequency} onChange={(e) => setForm((f) => ({ ...f, payFrequency: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm">
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="semimonthly">Semi-monthly</option>
                <option value="monthly">Monthly</option>
              </select>
              <select value={form.payType} onChange={(e) => setForm((f) => ({ ...f, payType: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm">
                <option value="hourly">Hourly</option>
                <option value="salary">Salary (per period)</option>
              </select>
              <input required type="number" step="0.01" placeholder={form.payType === 'hourly' ? 'Hourly rate' : 'Pay per period'} value={form.payRate} onChange={(e) => setForm((f) => ({ ...f, payRate: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            </div>
            <button type="submit" disabled={creating} className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm disabled:opacity-50">
              {creating ? 'Adding…' : 'Add staff member'}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        {!staff && !error && <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>}
        {staff && staff.length === 0 && <p className="text-sm text-slate-500 dark:text-zinc-400">No staff added yet.</p>}

        <div className="space-y-2">
          {staff?.map((s) => (
            <a key={s.id} href={`/admin/payroll/${s.id}`} className="block rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4 hover:border-slate-300 dark:hover:border-zinc-600">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-500">{s.province} · {s.pay_type === 'hourly' ? `$${(s.pay_rate_cents / 100).toFixed(2)}/hr` : `$${(s.pay_rate_cents / 100).toFixed(2)}/period`} · {s.pay_frequency}</p>
                </div>
                <span className="text-xs text-cyan-600 dark:text-cyan-400">View →</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
