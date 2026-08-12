'use client'

import { useState } from 'react'
import type { BoModuleKey } from '@/lib/barioOneModules'
import BarioOneModuleCheckboxes from './BarioOneModuleCheckboxes'

export default function BarioOneSignupForm({ initialModuleKeys = ['crm'] }: { initialModuleKeys?: BoModuleKey[] }) {
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [moduleKeys, setModuleKeys] = useState<BoModuleKey[]>(initialModuleKeys)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyName, email, password, moduleKeys }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      window.location.href = '/dashboard/bario-one'
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      id="signup"
      className="max-w-md mx-auto bg-zinc-900 border border-[#d4af37]/30 rounded-2xl p-6 space-y-4 shadow-[0_0_60px_-15px_rgba(212,175,55,0.25)]"
    >
      <h3 className="text-xl font-bold text-white">Start your 14-day free trial</h3>
      <div>
        <label className="text-xs font-medium text-zinc-400 block mb-1">Company name</label>
        <input
          type="text"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Acme Plumbing Ltd."
          className="w-full rounded-lg bg-black border border-zinc-700 px-3 py-2 text-sm text-white focus:border-[#d4af37] outline-none"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-zinc-400 block mb-1">Work email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full rounded-lg bg-black border border-zinc-700 px-3 py-2 text-sm text-white focus:border-[#d4af37] outline-none"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-zinc-400 block mb-1">Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          className="w-full rounded-lg bg-black border border-zinc-700 px-3 py-2 text-sm text-white focus:border-[#d4af37] outline-none"
        />
      </div>
      <BarioOneModuleCheckboxes selected={moduleKeys} onChange={setModuleKeys} dark />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-[#d4af37] hover:bg-[#c49f2f] disabled:opacity-50 text-black font-semibold text-sm px-4 py-2.5 transition-colors"
      >
        {busy ? 'Creating your workspace…' : 'Start free trial'}
      </button>
      <p className="text-[11px] text-zinc-500 text-center">No credit card required to start. Cancel anytime.</p>
    </form>
  )
}
