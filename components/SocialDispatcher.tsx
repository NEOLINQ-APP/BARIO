'use client'

import { useEffect, useState } from 'react'

type Platform = 'facebook' | 'instagram' | 'tiktok' | 'linkedin'

const PLATFORM_META: Record<Platform, { label: string; icon: string }> = {
  facebook: { label: 'Facebook', icon: '📘' },
  instagram: { label: 'Instagram', icon: '📸' },
  tiktok: { label: 'TikTok', icon: '🎵' },
  linkedin: { label: 'LinkedIn', icon: '💼' },
}
const ALL: Platform[] = ['facebook', 'instagram', 'tiktok', 'linkedin']

type PlatformResult = { status: 'posted' | 'failed'; externalId?: string; error?: string }
type Lead = { id: string; platform: string; full_name: string | null; email: string | null; phone: string | null; notified: boolean; created_at: string }

export default function SocialDispatcher() {
  const [connected, setConnected] = useState<Record<string, boolean>>({})
  const [appConfigured, setAppConfigured] = useState<Record<string, boolean>>({})
  const [notifyPhone, setNotifyPhone] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [selected, setSelected] = useState<Set<Platform>>(new Set(ALL))
  const [caption, setCaption] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState<'video' | 'image'>('video')
  const [isAdCampaign, setIsAdCampaign] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [results, setResults] = useState<Record<string, PlatformResult> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function loadConnections() {
    const res = await fetch('/api/social/connections')
    const data = await res.json()
    if (res.ok) {
      setConnected(data.connected)
      setAppConfigured(data.appConfigured)
      setNotifyPhone(data.notifyPhone ?? '')
    }
    setLoaded(true)
  }

  async function loadLeads() {
    const res = await fetch('/api/social/leads')
    const data = await res.json()
    if (res.ok) setLeads(data.leads)
  }

  useEffect(() => {
    loadConnections()
    loadLeads()
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) setError(err)
  }, [])

  function togglePlatform(p: Platform) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  async function disconnect(p: Platform) {
    await fetch(`/api/social/connections?platform=${p}`, { method: 'DELETE' })
    loadConnections()
  }

  async function saveNotifyPhone(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/social/connections', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notifyPhone: phoneInput }),
    })
    const data = await res.json()
    if (res.ok) {
      setNotifyPhone(phoneInput)
      setPhoneInput('')
    } else {
      setError(data.error)
    }
  }

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault()
    setDispatching(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch('/api/social/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          caption,
          mediaUrl: mediaUrl || null,
          mediaType,
          platforms: Array.from(selected),
          isAdCampaign,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Dispatch failed')
      setResults(data.results)
    } catch (err: any) {
      setError(err.message)
    }
    setDispatching(false)
  }

  if (!loaded) return <p className="text-sm text-slate-500 dark:text-zinc-500">Loading…</p>

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Connections */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">Connected accounts</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALL.map((p) => (
            <div key={p} className="rounded-xl border border-slate-200 dark:border-zinc-800 p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-slate-800 dark:text-zinc-200">
                  {PLATFORM_META[p].icon} {PLATFORM_META[p].label}
                </span>
              </div>
              {connected[p] ? (
                <button onClick={() => disconnect(p)} className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline">
                  Connected · Disconnect
                </button>
              ) : appConfigured[p] ? (
                <a href={`/api/social/connect/${p}`} className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline">
                  Connect →
                </a>
              ) : (
                <span className="text-xs text-slate-400 dark:text-zinc-500">Not available yet</span>
              )}
            </div>
          ))}
        </div>
        {ALL.some((p) => connected[p]) && (
          <form onSubmit={saveNotifyPhone} className="mt-3 flex items-center gap-2">
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder={notifyPhone || '+1XXXXXXXXXX for lead SMS alerts'}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs w-56"
            />
            <button type="submit" className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
              Save number
            </button>
          </form>
        )}
      </div>

      {/* Composer */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Blast a post</h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALL.map((p) => (
            <label
              key={p}
              className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm cursor-pointer ${
                selected.has(p) ? 'border-cyan-500 bg-cyan-500/5' : 'border-slate-200 dark:border-zinc-800'
              } ${!connected[p] ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <span>{PLATFORM_META[p].icon} {PLATFORM_META[p].label}</span>
              <input type="checkbox" checked={selected.has(p)} disabled={!connected[p]} onChange={() => togglePlatform(p)} />
            </label>
          ))}
        </div>

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          placeholder="Write your caption…"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        />

        <div className="flex gap-2">
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as 'video' | 'image')}
            className="px-2 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          >
            <option value="video">Video</option>
            <option value="image">Image</option>
          </select>
          <input
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="Media URL (paste from your X-Drive file link)"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
          <input type="checkbox" checked={isAdCampaign} onChange={(e) => setIsAdCampaign(e.target.checked)} />
          Run as a paid ad campaign (not enabled yet — posts organically only until an ad account is connected)
        </label>

        <button
          onClick={handleDispatch}
          disabled={dispatching || !caption || selected.size === 0}
          className="w-full px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm"
        >
          {dispatching ? 'Publishing…' : `Publish to ${selected.size || 0} platform${selected.size === 1 ? '' : 's'}`}
        </button>

        {results && (
          <div className="space-y-1 text-sm">
            {Object.entries(results).map(([platform, result]) => (
              <p key={platform} className={result.status === 'posted' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                {result.status === 'posted' ? '✅' : '❌'} {PLATFORM_META[platform as Platform]?.label ?? platform}: {result.status === 'posted' ? result.externalId : result.error}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Leads */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">Leads from your ads</h3>
        {!leads?.length ? (
          <p className="text-sm text-slate-400 dark:text-zinc-500">No leads yet — leads from connected Lead Ads will show up here instantly.</p>
        ) : (
          <div className="space-y-1">
            {leads.map((l) => (
              <div key={l.id} className="text-sm border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between">
                <span>{l.full_name ?? 'Unknown'} · {l.phone ?? l.email ?? '—'}</span>
                <span className="text-xs text-slate-400 dark:text-zinc-500">{new Date(l.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
