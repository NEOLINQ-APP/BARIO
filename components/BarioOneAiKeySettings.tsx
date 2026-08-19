'use client'

import { useEffect, useState } from 'react'

type Provider = { key: string; label: string; supported: boolean }

export default function BarioOneAiKeySettings() {
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [provider, setProvider] = useState<string | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])

  const [selectedProvider, setSelectedProvider] = useState('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  function load() {
    fetch('/api/bario-one/organization/ai-key')
      .then((r) => r.json())
      .then((data) => {
        setConfigured(Boolean(data.configured))
        setProvider(data.provider)
        setProviders(data.providers ?? [])
        setLoading(false)
      })
  }

  useEffect(load, [])

  async function save() {
    setError(null)
    setSavedMsg(null)
    if (apiKey.trim().length < 10) {
      setError('Enter a valid API key.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/bario-one/organization/ai-key', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, apiKey }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save key')
      setApiKey('')
      setSavedMsg('Saved.')
      load()
    } catch (err: any) {
      setError(err.message)
    }
    setSaving(false)
  }

  async function remove() {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/bario-one/organization/ai-key', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not remove key')
      load()
    } catch (err: any) {
      setError(err.message)
    }
    setSaving(false)
  }

  if (loading) return null

  const inputClass =
    'w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm disabled:opacity-60'

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Your own AI API key</h2>
      <p className="text-sm text-slate-500 dark:text-zinc-400">
        Lead generation normally shares a monthly quota included in your plan. Add your own AI provider key here and generate
        leads with no monthly limit — you're billed directly by that provider for your own usage instead.
      </p>

      {error && <p className="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
      {savedMsg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{savedMsg}</p>}

      {configured ? (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
            ✓ {providers.find((p) => p.key === provider)?.label ?? provider} key connected — lead generation is unlimited
          </span>
          <button onClick={remove} disabled={saving} className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50">
            Remove
          </button>
        </div>
      ) : (
        <div className="space-y-2 max-w-md">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Provider</label>
            <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)} className={inputClass}>
              {providers.map((p) => (
                <option key={p.key} value={p.key} disabled={!p.supported}>
                  {p.label}{!p.supported ? ' (coming soon)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">API key</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-..." className={inputClass} />
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm"
          >
            {saving ? 'Saving…' : 'Connect key'}
          </button>
        </div>
      )}
    </section>
  )
}
