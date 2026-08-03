'use client'

import { useEffect, useState } from 'react'

type Device = {
  id: string
  device_name: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export default function SyncedDevices() {
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/media/devices')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setDevices(data.devices)
        else setError(data.error || 'Failed to load devices')
      })
      .catch(() => setError('Failed to load devices'))
  }, [])

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this device? It will stop syncing until you sign back in on it.')) return
    setRevoking(id)
    try {
      const res = await fetch(`/api/media/devices/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setDevices((prev) => prev?.map((d) => (d.id === id ? { ...d, revoked_at: new Date().toISOString() } : d)) ?? null)
      } else {
        setError(data.error || 'Failed to revoke device')
      }
    } finally {
      setRevoking(null)
    }
  }

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">Synced devices</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          Devices running the X-Drive desktop sync app. Revoke one to stop it syncing immediately.
        </p>

        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-4">{error}</p>}

        <div className="mt-6 rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none divide-y divide-slate-200 dark:divide-zinc-800">
          {devices === null && !error && (
            <p className="text-sm text-slate-500 dark:text-zinc-400 p-6">Loading…</p>
          )}
          {devices?.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-zinc-400 p-6">
              No devices yet. Install the X-Drive desktop app and sign in to see it here.
            </p>
          )}
          {devices?.map((d) => (
            <div key={d.id} className="p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium truncate">{d.device_name}</div>
                <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Added {new Date(d.created_at).toLocaleDateString()}
                  {d.last_used_at && ` · Last synced ${new Date(d.last_used_at).toLocaleString()}`}
                  {d.revoked_at && ' · Revoked'}
                </div>
              </div>
              {!d.revoked_at && (
                <button
                  onClick={() => handleRevoke(d.id)}
                  disabled={revoking === d.id}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 font-semibold whitespace-nowrap disabled:opacity-50"
                >
                  {revoking === d.id ? 'Revoking…' : 'Revoke'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
