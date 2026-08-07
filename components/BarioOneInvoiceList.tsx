'use client'

import { useEffect, useState } from 'react'

type Invoice = {
  id: string
  type: 'estimate' | 'quote' | 'invoice'
  number: string
  status: string
  contact_name: string
  company_name: string | null
  due_date: string | null
  created_at: string
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400',
  sent: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  accepted: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
  paid: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
  overdue: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  void: 'bg-slate-100 dark:bg-zinc-800 text-slate-400 line-through',
}

export default function BarioOneInvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [filter, setFilter] = useState<'all' | 'estimate' | 'quote' | 'invoice'>('all')

  useEffect(() => {
    fetch('/api/bario-one/crm/invoices')
      .then((r) => r.json())
      .then((data) => setInvoices(data.invoices ?? []))
  }, [])

  if (invoices === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  const filtered = filter === 'all' ? invoices : invoices.filter((i) => i.type === filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(['all', 'estimate', 'quote', 'invoice'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg capitalize ${filter === f ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800'}`}
            >
              {f === 'all' ? 'All' : `${f}s`}
            </button>
          ))}
        </div>
        <a href="/dashboard/bario-one/crm/invoices/new" className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2">
          + New
        </a>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Nothing here yet.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {filtered.map((inv) => (
            <a key={inv.id} href={`/dashboard/bario-one/crm/invoices/${inv.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-zinc-900">
              <div>
                <p className="font-semibold text-sm">{inv.number} <span className="text-xs text-slate-400 capitalize">({inv.type})</span></p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{inv.contact_name}{inv.company_name ? ` — ${inv.company_name}` : ''}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[inv.status] ?? ''}`}>{inv.status}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
