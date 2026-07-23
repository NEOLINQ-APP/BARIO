'use client'

import { useEffect, useState } from 'react'

type DnsRecord = {
  id: string
  type: string
  name: string
  content: string
  priority?: number
  ttl: number
  managed: boolean
}

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT']

export default function DnsManager({ siteId, onClose }: { siteId: string | null; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nameservers, setNameservers] = useState<string[]>([])
  const [zoneStatus, setZoneStatus] = useState<string | null>(null)
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)

  const [newType, setNewType] = useState('A')
  const [newName, setNewName] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newPriority, setNewPriority] = useState('10')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/sites/dns${siteId ? `?site=${siteId}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load DNS records')
      setNameservers(data.nameservers ?? [])
      setZoneStatus(data.zoneStatus ?? null)
      setRecords(data.records ?? [])
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/sites/dns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          siteId,
          type: newType,
          name: newName,
          content: newContent,
          priority: newType === 'MX' ? Number(newPriority) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add record')
      setNewName('')
      setNewContent('')
      setShowAdd(false)
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function handleDelete(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/sites/dns/${id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete record')
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">DNS management</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>

        {loading && <p className="text-sm text-zinc-500">Loading…</p>}
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        {!loading && (
          <div className="space-y-5">
            <div className="rounded-xl border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 mb-1">
                Nameservers{' '}
                <strong className={zoneStatus === 'active' ? 'text-emerald-400' : 'text-amber-400'}>
                  {zoneStatus === 'active' ? '— active' : '— waiting for update at your registrar'}
                </strong>
              </div>
              <p className="text-xs text-zinc-500 mb-2">
                Set these as your domain's nameservers at whichever registrar you bought it from. Once they propagate
                (can take a few hours), your site and any records below go live automatically.
              </p>
              {nameservers.map((ns) => (
                <div key={ns} className="font-mono text-sm">{ns}</div>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400">DNS records</span>
                <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-[#f59e0b] underline">
                  {showAdd ? 'Cancel' : '+ Add record'}
                </button>
              </div>

              {showAdd && (
                <form onSubmit={handleAdd} className="rounded-lg border border-zinc-800 p-3 mb-3 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
                    >
                      {RECORD_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Name (e.g. @, www, mail)"
                      required
                      className="flex-1 px-2 py-1.5 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
                    />
                  </div>
                  <input
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Value (e.g. an IP, hostname, or text)"
                    required
                    className="w-full px-2 py-1.5 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
                  />
                  {newType === 'MX' && (
                    <input
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                      placeholder="Priority"
                      type="number"
                      className="w-32 px-2 py-1.5 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
                    />
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold disabled:opacity-50"
                  >
                    {busy ? 'Adding…' : 'Add record'}
                  </button>
                </form>
              )}

              <div className="space-y-1.5">
                {records.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-xs"
                  >
                    <div className="font-mono min-w-0">
                      <span className="text-zinc-500">{r.type}</span> {r.name} → {r.content}
                      {r.type === 'MX' && r.priority != null && <span className="text-zinc-500"> (priority {r.priority})</span>}
                      {r.managed && <span className="ml-2 text-cyan-400 font-sans">Required for your BARIO site</span>}
                    </div>
                    {!r.managed && (
                      <button onClick={() => handleDelete(r.id)} disabled={busy} className="text-red-400 underline ml-3 shrink-0">
                        Delete
                      </button>
                    )}
                  </div>
                ))}
                {records.length === 0 && <p className="text-xs text-zinc-500">No records yet.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
