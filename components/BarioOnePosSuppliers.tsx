'use client'

import { useEffect, useState } from 'react'

type Supplier = { id: string; name: string; email: string | null; phone: string | null }
type ProductOption = { id: string; name: string }
type PORow = { id: string; supplier_name: string; status: string; created_at: string }
type POLine = { productId: string; quantity: string; unitCostDollars: string }

function AddSupplierForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await fetch('/api/bario-one/pos/suppliers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, phone }),
      })
      setName(''); setEmail(''); setPhone('')
      setOpen(false)
      onAdded()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2">+ Add supplier</button>
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4 max-w-md">
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Supplier name" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">Save</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

function AddPOForm({ suppliers, products, onAdded }: { suppliers: Supplier[]; products: ProductOption[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [lines, setLines] = useState<POLine[]>([{ productId: '', quantity: '1', unitCostDollars: '' }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateLine(i: number, patch: Partial<POLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const items = lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) || 1, unitCostCents: Math.round(Number(l.unitCostDollars || 0) * 100) }))
      const res = await fetch('/api/bario-one/pos/purchase-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplierId, items }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setLines([{ productId: '', quantity: '1', unitCostDollars: '' }])
      setOpen(false)
      onAdded()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2">+ New purchase order</button>
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4 max-w-lg">
      <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
        <option value="">Select supplier…</option>
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2">
          <select value={l.productId} onChange={(e) => updateLine(i, { productId: e.target.value })} className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
            <option value="">Select product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} type="number" min="1" placeholder="Qty" className="w-20 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
          <input value={l.unitCostDollars} onChange={(e) => updateLine(i, { unitCostDollars: e.target.value })} type="number" min="0" step="0.01" placeholder="Cost $" className="w-24 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        </div>
      ))}
      <button type="button" onClick={() => setLines((p) => [...p, { productId: '', quantity: '1', unitCostDollars: '' }])} className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
        + Add line
      </button>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">Save</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

export default function BarioOnePosSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [pos, setPos] = useState<PORow[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function loadAll() {
    const [sRes, pRes, poRes] = await Promise.all([
      fetch('/api/bario-one/pos/suppliers'),
      fetch('/api/bario-one/pos/products'),
      fetch('/api/bario-one/pos/purchase-orders'),
    ])
    const sData = await sRes.json()
    const pData = await pRes.json()
    const poData = await poRes.json()
    setSuppliers(sData.suppliers ?? [])
    setProducts((pData.products ?? []).map((p: any) => ({ id: p.id, name: p.name })))
    setPos(poData.purchaseOrders ?? [])
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function receive(id: string) {
    setBusyId(id)
    try {
      await fetch(`/api/bario-one/pos/purchase-orders/${id}/receive`, { method: 'POST' })
      await loadAll()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold mb-3">Suppliers</h2>
        <AddSupplierForm onAdded={loadAll} />
        {suppliers.length > 0 && (
          <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
            {suppliers.map((s) => (
              <div key={s.id} className="p-3 text-sm">
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{s.email} {s.phone}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">Purchase Orders</h2>
        <AddPOForm suppliers={suppliers} products={products} onAdded={loadAll} />
        {pos === null ? (
          <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
        ) : pos.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-zinc-400">No purchase orders yet.</p>
        ) : (
          <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
            {pos.map((po) => (
              <div key={po.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-semibold">{po.supplier_name}</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{new Date(po.created_at).toLocaleDateString()}</p>
                </div>
                {po.status === 'received' ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">Received</span>
                ) : (
                  <button onClick={() => receive(po.id)} disabled={busyId === po.id} className="text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5">
                    Mark received (restocks)
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
