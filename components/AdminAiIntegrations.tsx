'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Integration = {
  id: string
  name: string
  provider: string
  model: string
  domains: string
  description: string
  has_cost_tracking: boolean
  source_file: string | null
}

export default function AdminAiIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/ai-integrations')
      .then((r) => r.json())
      .then((data) => (data.ok ? setIntegrations(data.integrations) : setError(data.error)))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">AI Integrations & Domains</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Every place Bario calls an AI model, which provider/model it uses, and which domain(s) it serves.</p>
            <a href="/admin" className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline">← Admin</a>
          </div>
          <ThemeToggle />
        </div>

        <div className="rounded-xl border border-amber-400/40 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Only Victoria has real, live per-call cost tracking today (see her call log). Everything else below is an accurate inventory of what exists — extending real usage/cost tracking to the rest is real follow-up work, not yet done.
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        {!integrations && !error && <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>}

        <div className="space-y-3">
          {integrations?.map((i) => (
            <div key={i.id} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{i.name}</p>
                <div className="flex gap-2 shrink-0">
                  {i.has_cost_tracking ? (
                    <a href="/admin/victoria" className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-medium hover:underline">
                      ✓ Live cost tracking →
                    </a>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 text-xs font-medium">Not yet tracked</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">{i.description}</p>
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs">
                <p><span className="text-slate-500 dark:text-zinc-500">Provider/model:</span> {i.provider} — {i.model}</p>
                <p><span className="text-slate-500 dark:text-zinc-500">Domain(s):</span> {i.domains}</p>
                {i.source_file && <p className="sm:col-span-2 font-mono text-slate-500 dark:text-zinc-500">{i.source_file}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
