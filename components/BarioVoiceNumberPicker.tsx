'use client'

import { useState } from 'react'

type NumberType = 'local' | 'tollfree'
type AvailableNumber = { phoneNumber: string; friendlyName: string; locality: string | null; region: string | null }

export default function BarioVoiceNumberPicker() {
  const [type, setType] = useState<NumberType>('local')
  const [areaCode, setAreaCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<AvailableNumber[]>([])
  const [provisioning, setProvisioning] = useState<string | null>(null)
  const [provisioned, setProvisioned] = useState<Record<string, string>>({})

  async function search() {
    setLoading(true)
    setError(null)
    setResults([])
    try {
      const params = new URLSearchParams({ type })
      if (type === 'local' && areaCode.trim()) params.set('areaCode', areaCode.trim())
      const res = await fetch(`/api/admin/bario-voice/numbers/search?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setResults(data.numbers)
      if (data.numbers.length === 0) setError('No numbers found — try a different area code.')
    } catch (err: any) {
      setError(err.message ?? 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  async function provision(phoneNumber: string) {
    const friendlyName = window.prompt('Label this number (e.g. customer/company name):', phoneNumber)
    if (friendlyName === null) return
    setProvisioning(phoneNumber)
    try {
      const res = await fetch('/api/admin/bario-voice/numbers/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, friendlyName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Purchase failed')
      setProvisioned((prev) => ({ ...prev, [phoneNumber]: data.sid }))
    } catch (err: any) {
      alert(err.message ?? 'Purchase failed')
    } finally {
      setProvisioning(null)
    }
  }

  return (
    <main className="min-h-screen bg-[#0b111c] text-slate-100 p-6 sm:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bario Voice — Number Search</h1>
          <p className="text-sm text-slate-400 mt-1">Search and purchase a real Twilio number for a new Bario Voice customer. Purchasing is real and immediate — a real recurring monthly cost starts right away.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as NumberType)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
              <option value="local">Local</option>
              <option value="tollfree">Toll-Free</option>
            </select>
          </div>
          {type === 'local' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Area code (optional)</label>
              <input
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value)}
                placeholder="e.g. 825"
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm w-32"
              />
            </div>
          )}
          <button onClick={search} disabled={loading} className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold rounded-lg px-4 py-2 text-sm">
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((n) => (
              <div key={n.phoneNumber} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
                <div>
                  <div className="font-mono text-sm">{n.phoneNumber}</div>
                  <div className="text-xs text-slate-400">{[n.locality, n.region].filter(Boolean).join(', ') || n.friendlyName}</div>
                </div>
                {provisioned[n.phoneNumber] ? (
                  <span className="text-xs text-green-400 font-medium">Purchased ✓</span>
                ) : (
                  <button
                    onClick={() => provision(n.phoneNumber)}
                    disabled={provisioning === n.phoneNumber}
                    className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg px-3 py-1.5"
                  >
                    {provisioning === n.phoneNumber ? 'Purchasing…' : 'Purchase'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
