'use client'

import { useEffect, useRef, useState } from 'react'
import BarioOneExpenseReview from './BarioOneExpenseReview'

type Expense = {
  id: string
  vendor: string | null
  category: string
  amount_cents: number
  tax_cents: number
  expense_date: string | null
  notes: string | null
  receipt_image_url: string | null
  status: 'needs_review' | 'confirmed'
}

const CATEGORIES = ['materials', 'fuel', 'meals', 'travel', 'equipment', 'office', 'utilities', 'uncategorized']

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function AddExpenseForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [vendor, setVendor] = useState('')
  const [category, setCategory] = useState('uncategorized')
  const [amount, setAmount] = useState('')
  const [tax, setTax] = useState('')
  const [expenseDate, setExpenseDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/expenses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vendor, category,
          amountCents: Math.round((Number(amount) || 0) * 100),
          taxCents: Math.round((Number(tax) || 0) * 100),
          expenseDate: expenseDate || undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Something went wrong')
      setVendor(''); setAmount(''); setTax(''); setExpenseDate(''); setCategory('uncategorized')
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
      <button onClick={() => setOpen(true)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm font-medium px-4 py-2">
        + Add manually
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input required value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="Total $" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={tax} onChange={(e) => setTax(e.target.value)} type="number" min="0" step="0.01" placeholder="Tax $ (optional)" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} type="date" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm sm:col-span-2" />
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Save expense'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

export default function BarioOneExpenses() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    const res = await fetch('/api/bario-one/expenses')
    const data = await res.json()
    setExpenses(data.expenses ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function handleScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanError(null)
    setScanning(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/bario-one/expenses/receipt', { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Something went wrong')
      await load()
    } catch (err: any) {
      setScanError(err.message)
    } finally {
      setScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (expenses === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  const needsReview = expenses.filter((e) => e.status === 'needs_review')
  const confirmed = expenses.filter((e) => e.status === 'confirmed')
  const totalCents = confirmed.reduce((sum, e) => sum + e.amount_cents, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 cursor-pointer">
          {scanning ? 'Scanning…' : '📷 Scan a receipt'}
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleScan} disabled={scanning} className="hidden" />
        </label>
        <AddExpenseForm onAdded={load} />
        <span className="text-sm text-slate-500 dark:text-zinc-400 ml-auto">Total confirmed: <span className="font-semibold text-slate-900 dark:text-zinc-100">{money(totalCents)}</span></span>
      </div>
      {scanError && <p className="text-sm text-red-500 dark:text-red-400">{scanError}</p>}

      {needsReview.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Needs review ({needsReview.length})</p>
          {needsReview.map((exp) => (
            <BarioOneExpenseReview key={exp.id} expense={exp} onDone={load} />
          ))}
        </div>
      )}

      <div>
        <p className="text-sm font-semibold mb-2">All expenses</p>
        {confirmed.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-zinc-400">No confirmed expenses yet.</p>
        ) : (
          <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
            {confirmed.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between p-4 text-sm">
                <div>
                  <p className="font-semibold">{exp.vendor || 'Unknown vendor'} <span className="text-xs text-slate-400">({exp.category})</span></p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{exp.expense_date ?? '—'}</p>
                </div>
                <p className="font-semibold">{money(exp.amount_cents)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
