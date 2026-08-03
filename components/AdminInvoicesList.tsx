'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type InvoiceRow = {
  id: string
  type: 'invoice' | 'quote'
  number: string
  status: string
  client_name: string
  currency: string
  totalCents: number
  created_at: string
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  void: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
}

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

export default function AdminInvoicesList() {
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    fetch('/api/admin/invoices')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error)
        setInvoices(data.invoices)
      })
      .catch((err) => setError(err.message))

    fetch('/api/admin/invoices/change-requests')
      .then((r) => r.json())
      .then((data) => data.ok && setPendingCount(data.changeRequests.filter((c: any) => c.status === 'pending').length))
      .catch(() => {})
  }, [])

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Quotes & Invoices</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Manually build a quote or invoice, pulling real prices from anything Bario sells, with room for a custom discount.</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex flex-wrap gap-3">
          <a href="/admin/invoices/new" className="inline-block px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm">
            + New quote/invoice
          </a>
          <a
            href="/admin/invoices/amber"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-400/50 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold text-sm"
          >
            💬 Ask Amber (finance assistant)
            {pendingCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-amber-950 text-xs">{pendingCount} pending</span>}
          </a>
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        {!invoices && !error && <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>}

        {invoices && invoices.length === 0 && <p className="text-sm text-slate-500 dark:text-zinc-400">No quotes or invoices yet.</p>}

        {invoices && invoices.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-zinc-500">
                  <th className="pb-2 font-normal">Number</th>
                  <th className="pb-2 font-normal">Client</th>
                  <th className="pb-2 font-normal">Type</th>
                  <th className="pb-2 font-normal">Status</th>
                  <th className="pb-2 font-normal text-right">Total</th>
                  <th className="pb-2 font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-slate-200 dark:border-zinc-800">
                    <td className="py-2">
                      <a href={`/admin/invoices/${inv.id}`} className="text-cyan-600 dark:text-cyan-400 hover:underline">{inv.number}</a>
                    </td>
                    <td className="py-2">{inv.client_name}</td>
                    <td className="py-2 text-xs text-slate-500 dark:text-zinc-500 capitalize">{inv.type}</td>
                    <td className="py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[inv.status] ?? ''}`}>{inv.status}</span></td>
                    <td className="py-2 text-right font-medium">{money(inv.totalCents, inv.currency)}</td>
                    <td className="py-2 whitespace-nowrap text-xs text-slate-500 dark:text-zinc-500">{new Date(inv.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
