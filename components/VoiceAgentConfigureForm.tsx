'use client'

import { useEffect, useState } from 'react'

type FloKey = { id: string; name: string; keyPrefix: string; revoked: boolean }

export default function VoiceAgentConfigureForm() {
  const [businessName, setBusinessName] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [forwardToNumber, setForwardToNumber] = useState('')
  const [greeting, setGreeting] = useState('')
  const [floKeys, setFloKeys] = useState<FloKey[]>([])
  const [floApiKeyId, setFloApiKeyId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/flo/keys')
      .then((r) => r.json())
      .then((d) => setFloKeys((d.keys ?? []).filter((k: FloKey) => !k.revoked)))
      .catch(() => {})
  }, [])

  const canSubmit = businessName.trim() && businessDescription.trim() && forwardToNumber.trim() && !busy

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/voice-agent/configure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessDescription: businessDescription.trim(),
          forwardToNumber: forwardToNumber.trim(),
          greeting: greeting.trim() || undefined,
          floApiKeyId: floApiKeyId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create order')

      const checkoutRes = await fetch('/api/voice-agent/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderId }),
      })
      const checkoutData = await checkoutRes.json()
      if (!checkoutRes.ok || !checkoutData.url) throw new Error(checkoutData.error ?? 'Failed to start checkout')
      window.location.href = checkoutData.url
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}

      <div>
        <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Business name</label>
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your Business Name"
          className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">What does your business do?</label>
        <textarea value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)} rows={3}
          placeholder="This is what the AI tells callers, and uses to answer their questions."
          className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Forward calls to (your real number)</label>
        <input value={forwardToNumber} onChange={(e) => setForwardToNumber(e.target.value)} placeholder="+17801234567"
          className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">Your phone rings first — the AI only answers if you don't pick up.</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Custom greeting (optional)</label>
        <input value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="Hi, thanks for calling — how can I help?"
          className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
      </div>

      {floKeys.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Send captured leads to (optional)</label>
          <select value={floApiKeyId} onChange={(e) => setFloApiKeyId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm">
            <option value="">Don't connect a CRM</option>
            {floKeys.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.keyPrefix}…)</option>)}
          </select>
        </div>
      )}

      <button type="submit" disabled={!canSubmit}
        className="w-full px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm">
        {busy ? 'Creating order…' : 'Continue to payment'}
      </button>
    </form>
  )
}
