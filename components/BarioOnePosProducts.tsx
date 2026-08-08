'use client'

import { useEffect, useState } from 'react'

type Product = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  price_cents: number
  cost_cents: number
  stock_quantity: number
  low_stock_threshold: number
  status: string
}

function AddProductForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [stock, setStock] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/pos/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name, sku, barcode,
          priceCents: Math.round(Number(price) * 100),
          costCents: Math.round(Number(cost || 0) * 100),
          stockQuantity: Number(stock) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setName(''); setSku(''); setBarcode(''); setPrice(''); setCost(''); setStock('0')
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
        + Add product
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU (optional)" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode (optional)" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input required value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" step="0.01" placeholder="Sale price $" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" min="0" step="0.01" placeholder="Cost $ (optional)" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={stock} onChange={(e) => setStock(e.target.value)} type="number" min="0" step="1" placeholder="Starting stock" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Save product'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

export default function BarioOnePosProducts() {
  const [products, setProducts] = useState<Product[] | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/pos/products')
    const data = await res.json()
    setProducts(data.products ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AddProductForm onAdded={load} />
        <div className="flex gap-2">
          <a href="/dashboard/bario-one/pos" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline self-center">Register →</a>
          <a href="/dashboard/bario-one/pos/sales" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline self-center">Sales →</a>
          <a href="/dashboard/bario-one/pos/suppliers" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline self-center">Suppliers →</a>
        </div>
      </div>

      {products === null ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No products yet — add your first one above.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{p.sku ? `SKU: ${p.sku}` : ''} {p.barcode ? `· Barcode: ${p.barcode}` : ''}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">${(p.price_cents / 100).toFixed(2)}</p>
                <p className={`text-xs ${p.stock_quantity <= p.low_stock_threshold ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-zinc-400'}`}>
                  {p.stock_quantity} in stock{p.stock_quantity <= p.low_stock_threshold ? ' — low' : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
