'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type SaleRecord = {
  id: string
  createdAt: string
  customerEmail: string | null
  product: string
  mode: 'payment' | 'subscription'
  amountTotal: number
  currency: string
  status: string
}
type Summary = { totalRevenueCents: number; countByProduct: Record<string, { count: number; revenueCents: number }>; currency: string }

function money(cents: number, currency: string) {
  return `${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

export default function AdminSales() {
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/sales?summary=1')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error)
        setSales(data.sales)
        setSummary(data.summary)
        setHasMore(data.hasMore)
        setCursor(data.nextCursor)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function loadMore() {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/admin/sales?cursor=${cursor}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setSales((prev) => [...prev, ...data.sales])
      setHasMore(data.hasMore)
      setCursor(data.nextCursor)
    } catch (err: any) {
      setError(err.message)
    }
    setLoadingMore(false)
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Sales & Records</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Every completed purchase across all Bario products, pulled live from Stripe — hosting plans, VPS, domains, templates, and X-Drive storage.
            </p>
          </div>
          <ThemeToggle />
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        {loading && <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>}

        {summary && (
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5">
              <p className="text-xs text-slate-500 dark:text-zinc-400">Total revenue (all-time)</p>
              <p className="text-2xl font-bold mt-1">{money(summary.totalRevenueCents, summary.currency)}</p>
            </div>
            {Object.entries(summary.countByProduct)
              .sort((a, b) => b[1].revenueCents - a[1].revenueCents)
              .map(([product, data]) => (
                <div key={product} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5">
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{product}</p>
                  <p className="text-lg font-semibold mt-1">{money(data.revenueCents, summary.currency)}</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">{data.count} sale{data.count === 1 ? '' : 's'}</p>
                </div>
              ))}
          </div>
        )}

        {sales.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 dark:text-zinc-500">
                    <th className="pb-2 font-normal">Date</th>
                    <th className="pb-2 font-normal">Customer</th>
                    <th className="pb-2 font-normal">Product</th>
                    <th className="pb-2 font-normal">Type</th>
                    <th className="pb-2 font-normal text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-t border-slate-200 dark:border-zinc-800">
                      <td className="py-2 whitespace-nowrap">{new Date(sale.createdAt).toLocaleDateString()}</td>
                      <td className="py-2">{sale.customerEmail ?? '—'}</td>
                      <td className="py-2">{sale.product}</td>
                      <td className="py-2 text-xs text-slate-500 dark:text-zinc-500">{sale.mode === 'subscription' ? 'Subscription' : 'One-time'}</td>
                      <td className="py-2 text-right font-medium">{money(sale.amountTotal, sale.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-4 px-4 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 text-sm hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}

        {!loading && sales.length === 0 && !error && (
          <p className="text-sm text-slate-500 dark:text-zinc-400">No completed sales yet.</p>
        )}
      </div>
    </main>
  )
}
