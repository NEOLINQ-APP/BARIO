'use client'

import { useEffect, useState } from 'react'

type Analytics = {
  connection: { sync_status: string; last_synced_at: string | null } | null
  leads: { total: number; last_30_days: number }
  reviews: { total: number; avg_rating: number | null; replied: number }
  promotions: { active: number; total: number }
  not_available: string[]
}

const card = 'rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4'
const NOT_AVAILABLE_LABEL: Record<string, string> = {
  page_views: 'Page views',
  click_through_rate: 'Click-through rate',
  conversion_rate: 'Conversion rate',
}

export default function BarioOneSpottAnalytics() {
  const [data, setData] = useState<Analytics | null>(null)

  useEffect(() => {
    fetch('/api/bario-one/spott/analytics').then((r) => r.json()).then(setData)
  }, [])

  if (!data) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!data.connection) return <p className="text-sm text-slate-500 dark:text-zinc-400">Connect a Spott listing to see analytics.</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={card}>
          <p className="text-xs text-slate-500 dark:text-zinc-400">Total leads</p>
          <p className="text-2xl font-bold">{data.leads.total}</p>
        </div>
        <div className={card}>
          <p className="text-xs text-slate-500 dark:text-zinc-400">Leads (30d)</p>
          <p className="text-2xl font-bold">{data.leads.last_30_days}</p>
        </div>
        <div className={card}>
          <p className="text-xs text-slate-500 dark:text-zinc-400">Avg rating</p>
          <p className="text-2xl font-bold">{data.reviews.avg_rating != null ? data.reviews.avg_rating.toFixed(1) : '—'}</p>
        </div>
        <div className={card}>
          <p className="text-xs text-slate-500 dark:text-zinc-400">Active promos</p>
          <p className="text-2xl font-bold">{data.promotions.active}</p>
        </div>
      </div>
      <div className={card}>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          {data.reviews.total} review{data.reviews.total === 1 ? '' : 's'} total, {data.reviews.replied} replied to. {data.promotions.total} promotion{data.promotions.total === 1 ? '' : 's'} created total.
        </p>
      </div>
      <div className={card}>
        <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Not available</p>
        <p className="text-xs text-slate-400 dark:text-zinc-500">
          {data.not_available.map((k) => NOT_AVAILABLE_LABEL[k] || k).join(', ')} — Spott doesn't expose these metrics via its API yet.
        </p>
      </div>
    </div>
  )
}
