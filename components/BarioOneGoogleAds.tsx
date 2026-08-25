'use client'

import { useEffect, useState } from 'react'

type Campaign = {
  id: string
  name: string
  status: string
  objective: string | null
  headline: string | null
  description: string | null
  keywords_json: string
  target_locations: string | null
  daily_budget_cents: number | null
  final_url: string | null
  created_at: string
}

function NewCampaignForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [headline, setHeadline] = useState('')
  const [description, setDescription] = useState('')
  const [keywords, setKeywords] = useState('')
  const [targetLocations, setTargetLocations] = useState('')
  const [dailyBudget, setDailyBudget] = useState('')
  const [finalUrl, setFinalUrl] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await fetch('/api/bario-one/marketing/google-ads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          headline,
          description,
          keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
          targetLocations,
          dailyBudgetCents: dailyBudget ? Math.round(parseFloat(dailyBudget) * 100) : undefined,
          finalUrl,
        }),
      })
      setName(''); setHeadline(''); setDescription(''); setKeywords(''); setTargetLocations(''); setDailyBudget(''); setFinalUrl('')
      setOpen(false)
      onAdded()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 mb-4">
        + New campaign draft
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-2 mb-4">
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Ad headline" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ad description" rows={2} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Keywords, comma-separated" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <input value={targetLocations} onChange={(e) => setTargetLocations(e.target.value)} placeholder="Target locations" className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} type="number" min="0" step="0.01" placeholder="Daily budget $" className="w-40 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      </div>
      <input value={finalUrl} onChange={(e) => setFinalUrl(e.target.value)} placeholder="Landing page URL" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Save draft'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg text-sm font-medium px-4 py-2 text-slate-500 dark:text-zinc-400">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function BarioOneGoogleAds() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/marketing/google-ads')
    const data = await res.json()
    setCampaigns(data.campaigns ?? [])
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="rounded-2xl border border-amber-300 dark:border-[#d4af37]/40 bg-amber-50 dark:bg-[#d4af37]/10 p-4 mb-6 text-sm">
        <p className="font-semibold text-amber-900 dark:text-[#d4af37]">Not connected to Google yet</p>
        <p className="text-amber-800 dark:text-zinc-300 mt-1">
          Real Google Ads API access needs a developer token, which only comes from applying inside your own
          Google Ads Manager account (Tools &amp; Settings → API Center) — there's no way to get one through
          this app alone. Draft your campaigns here in the meantime; once you have a token, these push straight
          to Google instead of staying drafts.
        </p>
      </div>

      <NewCampaignForm onAdded={load} />

      {campaigns === null ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No campaign drafts yet.</p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const keywords: string[] = JSON.parse(c.keywords_json || '[]')
            return (
              <div key={c.id} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{c.name}</h3>
                  <span className="text-xs font-medium uppercase tracking-wide rounded-full px-2 py-0.5 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                    {c.status}
                  </span>
                </div>
                {c.headline && <p className="text-sm font-medium mt-2">{c.headline}</p>}
                {c.description && <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">{c.description}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {keywords.map((k) => (
                    <span key={k} className="text-xs rounded-full px-2 py-0.5 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">{k}</span>
                  ))}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-slate-500 dark:text-zinc-400">
                  {c.target_locations && <span>📍 {c.target_locations}</span>}
                  {c.daily_budget_cents != null && <span>💰 ${(c.daily_budget_cents / 100).toFixed(2)}/day</span>}
                  {c.final_url && <span>🔗 {c.final_url}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
