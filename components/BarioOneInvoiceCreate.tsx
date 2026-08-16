'use client'

import { useEffect, useState } from 'react'

type CustomerOption = { id: string; contact_name: string; company_name: string | null }
type ProductOption = { id: string; name: string; description: string | null; price_cents: number; item_type: 'product' | 'service' }
type EmployeeOption = { id: string; name: string }
type Row = { description: string; quantity: string; unitPriceDollars: string; productId: string | null }
type DocType = 'estimate' | 'quote' | 'invoice' | 'work_order'

export default function BarioOneInvoiceCreate() {
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [customerId, setCustomerId] = useState('')
  const [type, setType] = useState<DocType>('invoice')
  const [rows, setRows] = useState<Row[]>([{ description: '', quantity: '1', unitPriceDollars: '', productId: null }])
  const [taxPercent, setTaxPercent] = useState('0')
  const [taxLabel, setTaxLabel] = useState('GST/HST')
  const [discountValue, setDiscountValue] = useState('0')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringInterval, setRecurringInterval] = useState<'weekly' | 'monthly' | 'yearly'>('monthly')
  const [scheduledDate, setScheduledDate] = useState('')
  const [jobSiteAddress, setJobSiteAddress] = useState('')
  const [assignedEmployeeId, setAssignedEmployeeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bario-one/crm/customers')
      .then((r) => r.json())
      .then((data) => setCustomers(data.customers ?? []))
    fetch('/api/bario-one/crm/invoices/products')
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
    // 'employees' is a separately-gated module — a 403 here just means no
    // picker is offered, work orders remain fully creatable without it.
    fetch('/api/bario-one/hr/employees')
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((data) => setEmployees(data.employees ?? []))
      .catch(() => setEmployees([]))
  }, [])

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((prev) => [...prev, { description: '', quantity: '1', unitPriceDollars: '', productId: null }])
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }
  function pickProduct(i: number, productId: string) {
    if (!productId) {
      updateRow(i, { productId: null })
      return
    }
    const p = products.find((p) => p.id === productId)
    if (!p) return
    updateRow(i, {
      productId: p.id,
      description: p.description || p.name,
      unitPriceDollars: (p.price_cents / 100).toFixed(2),
    })
  }

  const total = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.unitPriceDollars) || 0), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const items = rows
        .filter((r) => r.description.trim())
        .map((r) => ({
          description: r.description.trim(),
          quantity: Number(r.quantity) || 1,
          unitPriceCents: Math.round((Number(r.unitPriceDollars) || 0) * 100),
          productId: r.productId,
        }))
      const res = await fetch('/api/bario-one/crm/invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId,
          type,
          items,
          taxPercent: Number(taxPercent) || 0,
          taxLabel,
          discountType: Number(discountValue) > 0 ? 'fixed' : 'none',
          discountValue: Math.round((Number(discountValue) || 0) * 100),
          dueDate: dueDate || undefined,
          notes: notes || undefined,
          isRecurring,
          recurringInterval,
          scheduledDate: type === 'work_order' ? scheduledDate || undefined : undefined,
          jobSiteAddress: type === 'work_order' ? jobSiteAddress || undefined : undefined,
          assignedEmployeeId: type === 'work_order' ? assignedEmployeeId || undefined : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      window.location.href = `/dashboard/bario-one/crm/invoices/${data.id}`
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          <option value="">Select customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.contact_name}{c.company_name ? ` — ${c.company_name}` : ''}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as DocType)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          <option value="estimate">Estimate</option>
          <option value="quote">Quote</option>
          <option value="invoice">Invoice</option>
          <option value="work_order">Work order</option>
        </select>
      </div>

      {type === 'work_order' && (
        <div className="grid sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 p-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Scheduled date</label>
            <input value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} type="date" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Job site address</label>
            <input value={jobSiteAddress} onChange={(e) => setJobSiteAddress(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
          </div>
          {employees.length > 0 && (
            <div>
              <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Assigned to</label>
              <select value={assignedEmployeeId} onChange={(e) => setAssignedEmployeeId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
                <option value="">Unassigned</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Line items</p>
          <a href="/dashboard/bario-one/crm/invoices/products" target="_blank" rel="noreferrer" className="text-xs font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
            + Manage products/services →
          </a>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            {products.length > 0 && (
              <select
                value={r.productId ?? ''}
                onChange={(e) => pickProduct(i, e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-2 text-sm"
              >
                <option value="">Custom line…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <input value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} placeholder="Description" className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
            <input value={r.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} type="number" min="0" step="0.01" placeholder="Qty" className="w-20 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
            <input value={r.unitPriceDollars} onChange={(e) => updateRow(i, { unitPriceDollars: e.target.value })} type="number" min="0" step="0.01" placeholder="Price $" className="w-24 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
            {rows.length > 1 && (
              <button type="button" onClick={() => removeRow(i)} className="text-red-500 text-xs">Remove</button>
            )}
          </div>
        ))}
        <button type="button" onClick={addRow} className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">+ Add line</button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Tax label</label>
          <input value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Tax %</label>
          <input value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} type="number" min="0" step="0.01" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Discount $</label>
          <input value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} type="number" min="0" step="0.01" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Due date</label>
        <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      </div>

      {type === 'invoice' && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="w-4 h-4" />
          Recurring
          {isRecurring && (
            <select value={recurringInterval} onChange={(e) => setRecurringInterval(e.target.value as any)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1 text-sm">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          )}
        </label>
      )}

      <p className="text-sm font-semibold">Estimated total: ${total.toFixed(2)} (before tax/discount)</p>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={busy || !customerId} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
        {busy ? 'Saving…' : `Create ${type === 'work_order' ? 'work order' : type}`}
      </button>
    </form>
  )
}
