'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Staff = {
  id: string; name: string; email: string | null; province: string
  pay_type: 'hourly' | 'salary'; pay_rate_cents: number; pay_frequency: string
}
type Paystub = {
  id: string; pay_period_start: string; pay_period_end: string; pay_date: string
  gross_pay_cents: number; net_pay_cents: number; ytd_gross_cents: number; ytd_net_cents: number
}
type Td1Record = {
  id: string; status: 'pending' | 'completed' | 'expired'; tax_year: number
  federal_pdf_url: string | null; provincial_pdf_url: string | null
  federal_total_claim_cents: number | null; provincial_total_claim_cents: number | null
  signature_name: string | null; signed_at: string | null; expires_at: string; created_at: string
}
type LineItem = { label: string; amountCents: number }

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function AdminStaffDetail({ id }: { id: string }) {
  const [staff, setStaff] = useState<Staff | null>(null)
  const [paystubs, setPaystubs] = useState<Paystub[]>([])
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [td1Records, setTd1Records] = useState<Td1Record[]>([])
  const [sendingTd1, setSendingTd1] = useState(false)
  const [td1Error, setTd1Error] = useState<string | null>(null)
  const [td1Link, setTd1Link] = useState<string | null>(null)

  const [payPeriodStart, setPayPeriodStart] = useState('')
  const [payPeriodEnd, setPayPeriodEnd] = useState('')
  const [payDate, setPayDate] = useState('')
  const [hoursOrAmount, setHoursOrAmount] = useState('')
  const [bonuses, setBonuses] = useState<LineItem[]>([])
  const [deductions, setDeductions] = useState<LineItem[]>([])

  function load() {
    fetch(`/api/admin/staff/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error)
        setStaff(data.staff)
        setPaystubs(data.paystubs)
      })
      .catch((err) => setError(err.message))
  }
  useEffect(load, [id])

  function loadTd1() {
    fetch(`/api/admin/staff/${id}/td1`)
      .then((r) => r.json())
      .then((data) => data.ok && setTd1Records(data.records))
  }
  useEffect(loadTd1, [id])

  async function sendTd1() {
    setSendingTd1(true)
    setTd1Error(null)
    setTd1Link(null)
    try {
      const res = await fetch(`/api/admin/staff/${id}/td1`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create the TD1 link')
      setTd1Link(data.link)
      loadTd1()
    } catch (err: any) {
      setTd1Error(err.message)
    }
    setSendingTd1(false)
  }

  async function createPaystub(e: React.FormEvent) {
    e.preventDefault()
    if (!staff) return
    setCreating(true)
    setCreateError(null)
    try {
      const baseGross = staff.pay_type === 'hourly' ? Math.round(Number(hoursOrAmount) * staff.pay_rate_cents) : Math.round(Number(hoursOrAmount) * 100)
      const res = await fetch(`/api/admin/staff/${id}/paystubs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payPeriodStart, payPeriodEnd, payDate,
          grossPayCents: baseGross,
          bonuses, additionalDeductions: deductions,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create paystub')
      setPayPeriodStart(''); setPayPeriodEnd(''); setPayDate(''); setHoursOrAmount(''); setBonuses([]); setDeductions([])
      load()
    } catch (err: any) {
      setCreateError(err.message)
    }
    setCreating(false)
  }

  if (error) return <p className="p-6 text-sm text-red-500 dark:text-red-400">{error}</p>
  if (!staff) return <p className="p-6 text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{staff.name}</h1>
            <p className="text-xs text-slate-500 dark:text-zinc-500">{staff.province} · {staff.pay_type === 'hourly' ? `${money(staff.pay_rate_cents)}/hr` : `${money(staff.pay_rate_cents)}/period`} · {staff.pay_frequency}</p>
            <a href="/admin/payroll" className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline">← Payroll</a>
          </div>
          <ThemeToggle />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
          <p className="font-semibold text-sm">TD1 tax forms on file</p>
          {td1Records.length === 0 && <p className="text-xs text-slate-500 dark:text-zinc-500">None sent yet.</p>}
          {td1Records.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-3 text-xs space-y-1">
              <p>
                {r.status === 'completed' ? '✅ Completed' : new Date(r.expires_at).getTime() < Date.now() ? '⌛ Expired' : '⏳ Pending'}
                {' · '}Tax year {r.tax_year}
              </p>
              {r.status === 'completed' && (
                <>
                  <p className="text-slate-500 dark:text-zinc-500">
                    Signed by {r.signature_name} on {r.signed_at ? new Date(r.signed_at).toLocaleString() : ''}
                  </p>
                  <p className="text-slate-500 dark:text-zinc-500">
                    Federal claim {r.federal_total_claim_cents != null ? money(r.federal_total_claim_cents) : '—'} · Provincial claim {r.provincial_total_claim_cents != null ? money(r.provincial_total_claim_cents) : '—'}
                  </p>
                  <div className="flex gap-3">
                    {r.federal_pdf_url && <a href={r.federal_pdf_url} target="_blank" rel="noopener noreferrer" className="text-cyan-600 dark:text-cyan-400">Federal PDF →</a>}
                    {r.provincial_pdf_url && <a href={r.provincial_pdf_url} target="_blank" rel="noopener noreferrer" className="text-cyan-600 dark:text-cyan-400">Provincial PDF →</a>}
                  </div>
                </>
              )}
            </div>
          ))}
          <button onClick={sendTd1} disabled={sendingTd1} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-600 disabled:opacity-50 text-xs font-semibold">
            {sendingTd1 ? 'Creating link…' : 'Send TD1 form'}
          </button>
          {td1Link && (
            <div className="text-xs">
              <p className="text-slate-500 dark:text-zinc-500 mb-1">Link ready{staff.email ? ' (also emailed to them)' : ' — no email on file, send this manually:'}</p>
              <code className="block break-all px-2 py-1.5 rounded bg-slate-100 dark:bg-zinc-900">{td1Link}</code>
            </div>
          )}
          {td1Error && <p className="text-xs text-red-500 dark:text-red-400">{td1Error}</p>}
        </div>

        <form onSubmit={createPaystub} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5 space-y-3">
          <p className="font-semibold text-sm">New paystub</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Period start</label>
              <input required type="date" value={payPeriodStart} onChange={(e) => setPayPeriodStart(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Period end</label>
              <input required type="date" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Pay date</label>
              <input required type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">{staff.pay_type === 'hourly' ? 'Hours worked' : 'Gross pay this period ($)'}</label>
            <input required type="number" step="0.01" value={hoursOrAmount} onChange={(e) => setHoursOrAmount(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
          </div>

          {[{ label: 'Bonuses', items: bonuses, set: setBonuses }, { label: 'Additional deductions', items: deductions, set: setDeductions }].map((group) => (
            <div key={group.label}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-500 dark:text-zinc-400">{group.label}</label>
                <button type="button" onClick={() => group.set([...group.items, { label: '', amountCents: 0 }])} className="text-xs text-cyan-600 dark:text-cyan-400">+ add</button>
              </div>
              {group.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_24px] gap-2 mb-1">
                  <input
                    placeholder="Description"
                    value={item.label}
                    onChange={(e) => group.set(group.items.map((it, i) => (i === idx ? { ...it, label: e.target.value } : it)))}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                  />
                  <input
                    type="number" step="0.01" placeholder="$"
                    value={item.amountCents / 100 || ''}
                    onChange={(e) => group.set(group.items.map((it, i) => (i === idx ? { ...it, amountCents: Math.round(Number(e.target.value) * 100) } : it)))}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                  />
                  <button type="button" onClick={() => group.set(group.items.filter((_, i) => i !== idx))} className="text-red-500 dark:text-red-400 text-xs">✕</button>
                </div>
              ))}
            </div>
          ))}

          {createError && <p className="text-xs text-red-500 dark:text-red-400">{createError}</p>}
          <button type="submit" disabled={creating} className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm disabled:opacity-50">
            {creating ? 'Calculating…' : 'Create paystub'}
          </button>
        </form>

        <div>
          <p className="font-semibold text-sm mb-2">Paystub history</p>
          {paystubs.length === 0 && <p className="text-xs text-slate-500 dark:text-zinc-500">None yet.</p>}
          <div className="space-y-2">
            {paystubs.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-3 flex items-center justify-between text-sm">
                <div>
                  <p>{p.pay_period_start} – {p.pay_period_end} <span className="text-slate-500 dark:text-zinc-500">(paid {p.pay_date})</span></p>
                  <p className="text-xs text-slate-500 dark:text-zinc-500">Gross {money(p.gross_pay_cents)} → Net {money(p.net_pay_cents)} · YTD net {money(p.ytd_net_cents)}</p>
                </div>
                <a href={`/api/admin/paystubs/${p.id}/pdf`} className="text-xs text-cyan-600 dark:text-cyan-400 shrink-0">PDF →</a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
