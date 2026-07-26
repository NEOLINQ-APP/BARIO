'use client'

import { useState } from 'react'

const STORAGE_TIERS = ['free', 'starter', 'plus', 'pro', 'ultra', 'max', 'elite', 'enterprise']

export default function AdminUsers() {
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState('agency')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [storageEmail, setStorageEmail] = useState('')
  const [tier, setTier] = useState('max')
  const [storageBusy, setStorageBusy] = useState(false)
  const [storageMessage, setStorageMessage] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/users/grant-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to grant plan')
      setMessage(`${data.user.email} is now on the ${data.user.plan} plan.`)
      setEmail('')
    } catch (err: any) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function handleGrantStorage(e: React.FormEvent) {
    e.preventDefault()
    setStorageBusy(true)
    setStorageMessage(null)
    setStorageError(null)
    try {
      const res = await fetch('/api/admin/users/grant-storage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: storageEmail, tier }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to grant storage')
      setStorageMessage(`${data.user.email} is now on the ${data.user.storage_tier} storage tier.`)
      setStorageEmail('')
    } catch (err: any) {
      setStorageError(err.message)
    }
    setStorageBusy(false)
  }

  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-lg mx-auto space-y-10">
        <div>
          <a href="/admin" className="text-sm text-zinc-400 hover:text-zinc-200">← Admin</a>
          <h1 className="text-2xl font-bold mt-2">Grant a Plan</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Comp a paid plan onto an existing account — no payment involved, no Stripe subscription created. Stays active until you change it here again. The account must already exist (they need to have signed up).
          </p>

          <form onSubmit={handleGrant} className="mt-6 rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Account email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="someone@example.com"
                required
                className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Plan</label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
              >
                <option value="starter">Starter</option>
                <option value="business">Business</option>
                <option value="agency">Agency</option>
              </select>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            {message && <p className="text-xs text-emerald-400">{message}</p>}
            <button type="submit" disabled={busy} className="w-full px-4 py-2.5 rounded-lg bg-[#f59e0b] text-[#1a1200] text-sm font-semibold disabled:opacity-50">
              {busy ? 'Granting…' : 'Grant Plan'}
            </button>
          </form>
        </div>

        <div>
          <h2 className="text-xl font-bold">Grant Storage</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Comp a Media Library storage tier — separate from the site plan above. Same deal: no payment, no Stripe subscription, stays active until changed here.
          </p>

          <form onSubmit={handleGrantStorage} className="mt-6 rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Account email</label>
              <input
                type="email"
                value={storageEmail}
                onChange={(e) => setStorageEmail(e.target.value)}
                placeholder="someone@example.com"
                required
                className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Storage tier</label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm capitalize"
              >
                {STORAGE_TIERS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {storageError && <p className="text-xs text-red-400">{storageError}</p>}
            {storageMessage && <p className="text-xs text-emerald-400">{storageMessage}</p>}
            <button type="submit" disabled={storageBusy} className="w-full px-4 py-2.5 rounded-lg bg-[#f59e0b] text-[#1a1200] text-sm font-semibold disabled:opacity-50">
              {storageBusy ? 'Granting…' : 'Grant Storage'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
