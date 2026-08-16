'use client'

import { useState } from 'react'

type Expense = {
  id: string
  vendor: string | null
  category: string
  amount_cents: number
  tax_cents: number
  expense_date: string | null
  notes: string | null
  receipt_image_url: string | null
}

const CATEGORIES = ['materials', 'fuel', 'meals', 'travel', 'equipment', 'office', 'utilities', 'uncategorized']

// AI-extracted-and-editable review form, embedded inline in BarioOneExpenses
// for any row with status='needs_review'. Confirm PATCHes status to
// 'confirmed' — until then the row doesn't count toward reports.
export default function BarioOneExpenseReview({ expense, onDone }: { expense: Expense; onDone: () => void }) {
  const [vendor, setVendor] = useState(expense.vendor ?? '')
  const [category, setCategory] = useState(expense.category)
  const [amount, setAmount] = useState((expense.amount_cents / 100).toFixed(2))
  const [tax, setTax] = useState((expense.tax_cents / 100).toFixed(2))
  const [expenseDate, setExpenseDate] = useState(expense.expense_date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/bario-one/expenses/${expense.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vendor: vendor || null,
          category,
          amountCents: Math.round((Number(amount) || 0) * 100),
          taxCents: Math.round((Number(tax) || 0) * 100),
          expenseDate: expenseDate || null,
          status: 'confirmed',
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Something went wrong')
      onDone()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-900/10 p-4 space-y-3">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">🤖 AI-extracted from your receipt photo — please review before it's counted</p>
      {expense.receipt_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={expense.receipt_image_url} alt="Receipt" className="max-h-40 rounded-lg border border-slate-200 dark:border-zinc-800" />
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="Total $" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={tax} onChange={(e) => setTax(e.target.value)} type="number" min="0" step="0.01" placeholder="Tax $" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} type="date" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm sm:col-span-2" />
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <button onClick={confirm} disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
        {busy ? 'Confirming…' : 'Confirm expense'}
      </button>
    </div>
  )
}
