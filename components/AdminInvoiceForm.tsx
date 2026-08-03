'use client'

import { useEffect, useMemo, useState } from 'react'
import InvoicePreviewModal from '@/components/InvoicePreviewModal'

type CatalogItem = { key: string; category: string; label: string; unitPriceCents: number; currency: string }
type LineItem = { description: string; quantity: number; unitPriceCents: number }

export type InvoiceFormValue = {
  type: 'invoice' | 'quote'
  clientName: string
  clientEmail: string
  clientPhone: string
  clientAddress: string
  currency: string
  taxPercent: number
  discountType: 'none' | 'percent' | 'fixed'
  discountValue: number
  notes: string
  dueDate: string
  lineItems: LineItem[]
}

const EMPTY: InvoiceFormValue = {
  type: 'invoice',
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  clientAddress: '',
  currency: 'CAD',
  taxPercent: 0,
  discountType: 'none',
  discountValue: 0,
  notes: '',
  dueDate: '',
  lineItems: [],
}

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

export default function AdminInvoiceForm({
  initial,
  submitLabel,
  onSubmit,
  disabled,
  existingNumber,
}: {
  initial?: Partial<InvoiceFormValue>
  submitLabel: string
  onSubmit: (value: InvoiceFormValue) => Promise<void>
  disabled?: boolean
  existingNumber?: string
}) {
  const [previewing, setPreviewing] = useState(false)
  const [value, setValue] = useState<InvoiceFormValue>({ ...EMPTY, ...initial, lineItems: initial?.lineItems?.length ? initial.lineItems : [] })
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [catalogKey, setCatalogKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/admin/invoices/catalog')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setCatalog(data.catalog)
      })
      .catch(() => {})
  }, [])

  const grouped = useMemo(() => {
    const groups: Record<string, CatalogItem[]> = {}
    for (const item of catalog) {
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push(item)
    }
    return groups
  }, [catalog])

  function update<K extends keyof InvoiceFormValue>(key: K, v: InvoiceFormValue[K]) {
    setValue((prev) => ({ ...prev, [key]: v }))
  }

  function addCatalogItem() {
    const item = catalog.find((c) => c.key === catalogKey)
    if (!item) return
    update('lineItems', [...value.lineItems, { description: item.label, quantity: 1, unitPriceCents: item.unitPriceCents }])
    setCatalogKey('')
  }

  function addCustomItem() {
    update('lineItems', [...value.lineItems, { description: '', quantity: 1, unitPriceCents: 0 }])
  }

  function updateLineItem(idx: number, patch: Partial<LineItem>) {
    const items = value.lineItems.slice()
    items[idx] = { ...items[idx], ...patch }
    update('lineItems', items)
  }

  function removeLineItem(idx: number) {
    update('lineItems', value.lineItems.filter((_, i) => i !== idx))
  }

  const subtotalCents = value.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPriceCents, 0)
  const discountCents =
    value.discountType === 'percent'
      ? Math.round((subtotalCents * value.discountValue) / 100)
      : value.discountType === 'fixed'
        ? Math.round(value.discountValue)
        : 0
  const discountedSubtotalCents = Math.max(subtotalCents - discountCents, 0)
  const taxCents = Math.round((discountedSubtotalCents * value.taxPercent) / 100)
  const totalCents = discountedSubtotalCents + taxCents

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!value.clientName.trim()) return setError('Client name is required')
    if (value.lineItems.length === 0) return setError('Add at least one line item')
    for (const li of value.lineItems) {
      if (!li.description.trim() || !(li.quantity > 0) || li.unitPriceCents < 0) return setError('Every line item needs a description, a positive quantity, and a non-negative price')
    }
    setSubmitting(true)
    try {
      await onSubmit(value)
    } catch (err: any) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Type</label>
          <select
            value={value.type}
            onChange={(e) => update('type', e.target.value as 'invoice' | 'quote')}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          >
            <option value="invoice">Invoice</option>
            <option value="quote">Quote</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Currency</label>
          <input
            value={value.currency}
            onChange={(e) => update('currency', e.target.value.toUpperCase())}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Client name</label>
          <input
            required
            value={value.clientName}
            onChange={(e) => update('clientName', e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Client email</label>
          <input
            type="email"
            value={value.clientEmail}
            onChange={(e) => update('clientEmail', e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Client phone (for WhatsApp/Signal sharing)</label>
          <input
            type="tel"
            value={value.clientPhone}
            onChange={(e) => update('clientPhone', e.target.value)}
            placeholder="+1 780 555 1234"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Client address</label>
          <textarea
            value={value.clientAddress}
            onChange={(e) => update('clientAddress', e.target.value)}
            rows={2}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Due date</label>
          <input
            type="date"
            value={value.dueDate}
            onChange={(e) => update('dueDate', e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Line items</h3>
          <div className="flex items-center gap-2">
            <select
              value={catalogKey}
              onChange={(e) => setCatalogKey(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs max-w-[220px]"
            >
              <option value="">Add from products…</option>
              {Object.entries(grouped).map(([category, items]) => (
                <optgroup key={category} label={category}>
                  {items.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label} — {money(item.unitPriceCents, item.currency)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button type="button" onClick={addCatalogItem} disabled={!catalogKey} className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs disabled:opacity-40">
              Add
            </button>
            <button type="button" onClick={addCustomItem} className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs">
              + Custom item
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {value.lineItems.map((li, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_70px_110px_30px] gap-2 items-center">
              <input
                value={li.description}
                onChange={(e) => updateLineItem(idx, { description: e.target.value })}
                placeholder="Description"
                className="px-2 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
              <input
                type="number"
                min={0.01}
                step="any"
                value={li.quantity}
                onChange={(e) => updateLineItem(idx, { quantity: Number(e.target.value) })}
                className="px-2 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={(li.unitPriceCents / 100).toFixed(2)}
                onChange={(e) => updateLineItem(idx, { unitPriceCents: Math.round(Number(e.target.value) * 100) })}
                className="px-2 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
              <button type="button" onClick={() => removeLineItem(idx)} className="text-red-500 dark:text-red-400 text-sm">
                ✕
              </button>
            </div>
          ))}
          {value.lineItems.length === 0 && <p className="text-xs text-slate-500 dark:text-zinc-500">No line items yet.</p>}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Tax %</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={value.taxPercent}
            onChange={(e) => update('taxPercent', Number(e.target.value))}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Discount type</label>
          <select
            value={value.discountType}
            onChange={(e) => update('discountType', e.target.value as InvoiceFormValue['discountType'])}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          >
            <option value="none">No discount</option>
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed amount off</option>
          </select>
        </div>
        {value.discountType !== 'none' && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">
              {value.discountType === 'percent' ? 'Discount %' : `Discount amount (${value.currency})`}
            </label>
            <input
              type="number"
              min={0}
              step={value.discountType === 'percent' ? '0.01' : '0.01'}
              value={value.discountType === 'percent' ? value.discountValue : (value.discountValue / 100).toFixed(2)}
              onChange={(e) =>
                update('discountValue', value.discountType === 'percent' ? Number(e.target.value) : Math.round(Number(e.target.value) * 100))
              }
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Notes</label>
        <textarea
          value={value.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#0f1622] p-4 text-sm space-y-1 max-w-xs ml-auto">
        <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Subtotal</span><span>{money(subtotalCents, value.currency)}</span></div>
        {discountCents > 0 && (
          <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Discount</span><span>-{money(discountCents, value.currency)}</span></div>
        )}
        {taxCents > 0 && (
          <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Tax</span><span>{money(taxCents, value.currency)}</span></div>
        )}
        <div className="flex justify-between font-semibold pt-1 border-t border-slate-200 dark:border-zinc-800"><span>Total</span><span>{money(totalCents, value.currency)}</span></div>
      </div>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setPreviewing(true)}
          className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 font-semibold text-sm"
        >
          Preview
        </button>
        <button
          type="submit"
          disabled={submitting || disabled}
          className="px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>

      {previewing && (
        <InvoicePreviewModal
          type={value.type}
          number={existingNumber}
          clientName={value.clientName}
          clientEmail={value.clientEmail}
          clientAddress={value.clientAddress}
          currency={value.currency}
          dueDate={value.dueDate}
          notes={value.notes}
          lineItems={value.lineItems}
          subtotalCents={subtotalCents}
          discountCents={discountCents}
          taxCents={taxCents}
          totalCents={totalCents}
          onClose={() => setPreviewing(false)}
        />
      )}
    </form>
  )
}
