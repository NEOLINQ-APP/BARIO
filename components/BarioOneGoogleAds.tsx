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
  google_ads_campaign_id: string | null
  push_error: string | null
  created_at: string
}

function NewCampaignForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [headline, setHeadline] = useState('')
  const [description, setDescription] = useState('')
  const [extraHeadlines, setExtraHeadlines] = useState('')
  const [extraDescriptions, setExtraDescriptions] = useState('')
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
          headlines: [headline, ...extraHeadlines.split(',').map((h) => h.trim())].filter(Boolean),
          descriptions: [description, ...extraDescriptions.split(',').map((d) => d.trim())].filter(Boolean),
          keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
          targetLocations,
          dailyBudgetCents: dailyBudget ? Math.round(parseFloat(dailyBudget) * 100) : undefined,
          finalUrl,
        }),
      })
      setName(''); setHeadline(''); setDescription(''); setExtraHeadlines(''); setExtraDescriptions(''); setKeywords(''); setTargetLocations(''); setDailyBudget(''); setFinalUrl('')
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
      <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Primary ad headline" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <input value={extraHeadlines} onChange={(e) => setExtraHeadlines(e.target.value)} placeholder="2+ more headlines, comma-separated (Google needs 3+ total)" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Primary ad description" rows={2} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <input value={extraDescriptions} onChange={(e) => setExtraDescriptions(e.target.value)} placeholder="1+ more descriptions, comma-separated (Google needs 2+ total)" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
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

function PushButton({ campaignId, onDone }: { campaignId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)

  async function push() {
    setBusy(true)
    try {
      await fetch(`/api/bario-one/marketing/google-ads/${campaignId}/push`, { method: 'POST' })
    } finally {
      setBusy(false)
      onDone()
    }
  }

  return (
    <button
      onClick={push}
      disabled={busy}
      className="mt-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
    >
      {busy ? 'Pushing…' : 'Push to Google'}
    </button>
  )
}

export default function BarioOneGoogleAds() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [connected, setConnected] = useState(false)
  const [connectedAt, setConnectedAt] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ kind: 'connected' | 'error'; message?: string } | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/marketing/google-ads')
    const data = await res.json()
    setCampaigns(data.campaigns ?? [])
    setConnected(!!data.connected)
    setConnectedAt(data.connectedAt ?? null)
  }

  useEffect(() => {
    load()
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected')) setBanner({ kind: 'connected' })
    else if (params.get('error')) setBanner({ kind: 'error', message: params.get('error') ?? undefined })
    if (params.get('connected') || params.get('error')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  return (
    <div>
      {banner?.kind === 'connected' && (
        <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 mb-6 text-sm text-emerald-800 dark:text-emerald-300">
          Google Ads connected — campaign drafts can now be pushed live.
        </div>
      )}
      {banner?.kind === 'error' && (
        <div className="rounded-2xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 mb-6 text-sm text-red-800 dark:text-red-300">
          {banner.message || 'Something went wrong connecting Google Ads.'}
        </div>
      )}

      {connected ? (
        <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 mb-6 text-sm">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">✓ Connected to Google Ads</p>
          {connectedAt && (
            <p className="text-emerald-700 dark:text-emerald-400 mt-1">
              Connected {new Date(connectedAt).toLocaleDateString()}. Real campaign push isn't wired up yet — the
              connection is live, drafts below still need one more step before they launch.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-300 dark:border-[#d4af37]/40 bg-amber-50 dark:bg-[#d4af37]/10 p-4 mb-6 text-sm">
          <p className="font-semibold text-amber-900 dark:text-[#d4af37]">Not connected to Google yet</p>
          <p className="text-amber-800 dark:text-zinc-300 mt-1">
            Draft your campaigns here in the meantime — once connected, these push straight to Google instead of
            staying drafts. Real production use also needs Google's separate "Basic Access" approval on the
            developer token, which can take a few days.
          </p>
          <a
            href="/api/bario-one/marketing/google-ads/oauth/start"
            className="inline-block mt-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2"
          >
            Connect Google Ads
          </a>
        </div>
      )}

      <NewCampaignForm onAdded={load} />

      {campaigns === null ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No campaign drafts yet.</p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const keywords: string[] = JSON.parse(c.keywords_json || '[]')
            const statusColor =
              c.status === 'pushed' ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
              : c.status === 'error' ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400'
              : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
            return (
              <div key={c.id} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{c.name}</h3>
                  <span className={`text-xs font-medium uppercase tracking-wide rounded-full px-2 py-0.5 ${statusColor}`}>
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
                {c.status === 'pushed' && c.google_ads_campaign_id && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                    ✓ Live in Google Ads — campaign ID {c.google_ads_campaign_id}
                  </p>
                )}
                {c.push_error && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">⚠ {c.push_error}</p>
                )}
                {connected && c.status !== 'pushed' && (
                  <PushButton campaignId={c.id} onDone={load} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
