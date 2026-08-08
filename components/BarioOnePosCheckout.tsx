'use client'

import { useEffect, useState } from 'react'

type Product = { id: string; name: string; sku: string | null; barcode: string | null; price_cents: number; stock_quantity: number }
type CustomerOption = { id: string; contact_name: string; company_name: string | null }
type CartLine = { productId: string; name: string; quantity: number; unitPriceCents: number }

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function BarioOnePosCheckout() {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [customerId, setCustomerId] = useState('')
  const [taxPercent, setTaxPercent] = useState('0')
  const [discount, setDiscount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'other'>('cash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bario-one/crm/customers')
      .then((r) => r.json())
      .then((data) => setCustomers(data.customers ?? []))
  }, [])

  useEffect(() => {
    if (!search.trim()) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      fetch(`/api/bario-one/pos/products?q=${encodeURIComponent(search)}`)
        .then((r) => r.json())
        .then((data) => setResults(data.products ?? []))
    }, 200)
    return () => clearTimeout(t)
  }, [search])

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id)
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l))
      return [...prev, { productId: p.id, name: p.name, quantity: 1, unitPriceCents: p.price_cents }]
    })
    setSearch('')
    setResults([])
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.productId !== productId))
    } else {
      setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: qty } : l)))
    }
  }

  const subtotal = cart.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0)
  const discountCents = Math.min(Math.round(Number(discount || 0) * 100), subtotal)
  const taxCents = Math.round(((subtotal - discountCents) * Number(taxPercent || 0)) / 100)
  const total = subtotal - discountCents + taxCents

  async function completeSale() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/pos/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          customerId: customerId || undefined,
          taxPercent: Number(taxPercent) || 0,
          discountCents,
          paymentMethod,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed')
      setCompletedSaleId(data.id)
      setCart([])
      setDiscount('0')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (completedSaleId) {
    return (
      <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-6 space-y-3 max-w-md">
        <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Sale complete ✓</p>
        <a href={`/api/bario-one/pos/sales/${completedSaleId}/receipt`} target="_blank" rel="noreferrer" className="inline-block rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2">
          View / print receipt
        </a>
        <div>
          <button onClick={() => setCompletedSaleId(null)} className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
            New sale →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-3">
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Scan barcode or search by name/SKU…"
            className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#131b2a] shadow-lg max-h-64 overflow-y-auto">
              {results.map((p) => (
                <button key={p.id} onClick={() => addToCart(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800 flex justify-between">
                  <span>{p.name} {p.stock_quantity <= 0 && <span className="text-red-500 text-xs">(out of stock)</span>}</span>
                  <span className="font-semibold">{money(p.price_cents)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
          <p className="text-sm font-semibold mb-2">Cart</p>
          {cart.length === 0 ? (
            <p className="text-xs text-slate-400">Empty — search above to add items.</p>
          ) : (
            <ul className="space-y-2">
              {cart.map((l) => (
                <li key={l.productId} className="flex items-center justify-between text-sm">
                  <span>{l.name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={l.quantity}
                      onChange={(e) => updateQty(l.productId, Number(e.target.value))}
                      className="w-16 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1 text-sm"
                    />
                    <span className="w-20 text-right font-semibold">{money(l.quantity * l.unitPriceCents)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3">
        <div>
          <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Customer (optional, for loyalty points)</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
            <option value="">Walk-in</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.contact_name}{c.company_name ? ` — ${c.company_name}` : ''}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Tax %</label>
            <input value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} type="number" min="0" step="0.01" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Discount $</label>
            <input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" min="0" step="0.01" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Payment method</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="border-t border-slate-200 dark:border-zinc-800 pt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Subtotal</span><span>{money(subtotal)}</span></div>
          {discountCents > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Discount</span><span>-{money(discountCents)}</span></div>}
          {taxCents > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Tax</span><span>{money(taxCents)}</span></div>}
          <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-200 dark:border-zinc-800"><span>Total</span><span>{money(total)}</span></div>
        </div>

        {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        <button
          onClick={completeSale}
          disabled={busy || cart.length === 0}
          className="w-full rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-3"
        >
          {busy ? 'Processing…' : `Complete sale — ${money(total)}`}
        </button>
      </div>
    </div>
  )
}
