'use client'

import { useEffect, useState } from 'react'
import BarioDialer from './BarioDialer'

// Lightweight passcode gate for the self-serve client Dialer
// (app/dialer/<key>/page.tsx) — lets AFC/Sunbuilt staff reach their own
// Bario Dialer without a Bario admin login. Mirrors the same
// "remember locally once entered" UX as afclogistics.ca's own footer
// passcode gate, but the actual check happens server-side
// (app/api/dialer-access/check) so the real passcode never ships in the
// client JS bundle.
export default function ClientDialerGate({
  businessKey,
  businessLabel,
  swScope,
}: {
  businessKey: string
  businessLabel: string
  swScope: string
}) {
  // Stores the actual passcode (not just a "verified" flag) so it can be
  // resent as X-Dialer-Passcode on every Dialer API call after a reload —
  // same trust tier as afclogistics.ca's own client-side passcode gate,
  // not a real session/token system.
  const storageKey = `bario_dialer_passcode_${businessKey}`
  const [unlockedPasscode, setUnlockedPasscode] = useState<string | null>(null)
  const [checkedStorage, setCheckedStorage] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    setUnlockedPasscode(window.localStorage.getItem(storageKey))
    setCheckedStorage(true)
  }, [storageKey])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setChecking(true)
    try {
      const res = await fetch('/api/dialer-access/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessKey, passcode }),
      })
      if (!res.ok) {
        setError('Incorrect passcode — check with whoever gave you access.')
        return
      }
      window.localStorage.setItem(storageKey, passcode)
      setUnlockedPasscode(passcode)
    } catch {
      setError('Could not verify right now — try again.')
    } finally {
      setChecking(false)
    }
  }

  if (!checkedStorage) return null

  if (unlockedPasscode) {
    return <BarioDialer lockedBusinessKey={businessKey} swScope={swScope} dialerPasscode={unlockedPasscode} />
  }

  return (
    <div className="min-h-screen bg-[#0b111c] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-3xl mb-5 mx-auto">
          📞
        </div>
        <h1 className="text-xl font-bold text-white text-center mb-1">{businessLabel} Dialer</h1>
        <p className="text-sm text-slate-400 text-center mb-6">Enter your access passcode to continue.</p>
        <input
          type="password"
          inputMode="text"
          autoFocus
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          className="w-full mb-3 px-4 py-3 rounded-xl bg-[#111a2c] border border-[#22304a] text-base text-white text-center tracking-widest"
        />
        {error && <p className="text-sm font-medium text-red-400 mb-3 text-center">{error}</p>}
        <button
          type="submit"
          disabled={checking || !passcode.trim()}
          className="w-full py-3 rounded-xl bg-emerald-600 disabled:opacity-50 text-white font-semibold"
        >
          {checking ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
