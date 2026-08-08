'use client'

import { useEffect, useState } from 'react'

type Sale = { id: string; customer_name: string | null; total_cents: number; payment_method: string; status: string; loyalty_points_earned: number; created_at: string }

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function BarioOnePosSales() {
  const [sales, setSales] = useState<Sale[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/pos/sales')
    const data = await res.json()
    setSales(data.sales ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function refund(id: string) {
    if (!confirm('Refund this sale? This restocks the items and reverses any loyalty points earned.')) return
    setBusyId(id)
    try {
      await fetch(`/api/bario-one/pos/sales/${id}/refund`, { method: 'POST' })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  if (sales === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (sales.length === 0) return <p className="text-sm text-slate-500 dark:text-zinc-400">No sales yet.</p>

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
      {sales.map((s) => (
        <div key={s.id} className="flex items-center justify-between p-4 text-sm">
          <div>
            <p className="font-semibold">{money(s.total_cents)} <span className="text-xs text-slate-400 capitalize">({s.payment_method})</span></p>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {s.customer_name ?? 'Walk-in'} · {new Date(s.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {s.status === 'refunded' ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">Refunded</span>
            ) : (
              <button onClick={() => refund(s.id)} disabled={busyId === s.id} className="text-xs text-red-500 hover:underline disabled:opacity-50">
                Refund
              </button>
            )}
            <a href={`/api/bario-one/pos/sales/${s.id}/receipt`} target="_blank" rel="noreferrer" className="text-xs text-amber-600 dark:text-[#d4af37] hover:underline">
              Receipt
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}
