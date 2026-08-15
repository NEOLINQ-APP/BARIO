'use client'

import { useEffect, useState } from 'react'

type Product = {
  id: string
  name: string
  description: string | null
  sku: string | null
  price_cents: number
  cost_cents: number
  item_type: 'product' | 'service'
  status: 'active' | 'inactive'
}

function AddForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [itemType, setItemType] = useState<'product' | 'service'>('service')
  const [sku, setSku] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/crm/invoices/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          itemType,
          sku,
          priceCents: Math.round((Number(price) || 0) * 100),
          costCents: Math.round((Number(cost) || 0) * 100),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setName(''); setDescription(''); setSku(''); setPrice(''); setCost('')
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
        + Add product/service
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <select value={itemType} onChange={(e) => setItemType(e.target.value as any)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          <option value="service">Service</option>
          <option value="product">Product</option>
        </select>
        <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU (optional)" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm sm:col-span-2" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description shown on invoice (optional)" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm sm:col-span-2" />
        <input required value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" step="0.01" placeholder="Price $" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" min="0" step="0.01" placeholder="Your cost $ (optional)" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

export default function BarioOneInvoiceCatalog() {
  const [products, setProducts] = useState<Product[] | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/crm/invoices/products?includeInactive=1')
    const data = await res.json()
    setProducts(data.products ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleActive(p: Product) {
    await fetch(`/api/bario-one/crm/invoices/products/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: p.status === 'active' ? 'inactive' : 'active' }),
    })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AddForm onAdded={load} />
        <a href="/dashboard/bario-one/crm/invoices" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">← Invoices</a>
      </div>

      {products === null ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No products or services yet — add your first one above.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-semibold">
                  {p.name}{' '}
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                    {p.item_type}
                  </span>
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{p.sku ? `SKU: ${p.sku}` : p.description ?? ''}</p>
              </div>
              <div className="text-right flex items-center gap-3">
                <p className="font-semibold">${(p.price_cents / 100).toFixed(2)}</p>
                <button onClick={() => toggleActive(p)} className="text-xs text-slate-500 dark:text-zinc-400 hover:underline">
                  {p.status === 'active' ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
