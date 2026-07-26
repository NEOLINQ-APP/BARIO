'use client'

import { useEffect, useRef, useState } from 'react'
import { STORAGE_TIERS, STORAGE_TIER_KEYS } from '@/lib/storageTiers'

type Asset = {
  id: string
  folder: string
  filename: string
  url: string
  content_type: string
  size_bytes: number
  created_at: string
}

type MediaResponse = {
  folder: string
  folders: string[]
  assets: Asset[]
  tier: string
  limitBytes: number
  usedBytes: number
  isFamilyMember: boolean
}

type FamilyGroup = {
  id: string
  ownerId: string
  isOwner: boolean
  members: { id: string; email: string }[]
  invites: { id: string; email: string; status: string; expires_at: string }[]
}

const TIERS = STORAGE_TIER_KEYS.map((key) => ({
  key,
  label: STORAGE_TIERS[key].label,
  gb: STORAGE_TIERS[key].bytes / 1024 ** 3,
  price: STORAGE_TIERS[key].priceCentsCad / 100,
}))

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export default function MediaLibrary() {
  const [data, setData] = useState<MediaResponse | null>(null)
  const [folder, setFolder] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [showTiers, setShowTiers] = useState(false)
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)

  const [family, setFamily] = useState<FamilyGroup | null | undefined>(undefined)
  const [inviteEmail, setInviteEmail] = useState('')
  const [familyBusy, setFamilyBusy] = useState(false)
  const [familyError, setFamilyError] = useState<string | null>(null)

  function loadMedia(f: string) {
    setError(null)
    fetch(`/api/media?folder=${encodeURIComponent(f)}`)
      .then((res) => res.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch((err) => setError(err.message))
  }

  function loadFamily() {
    fetch('/api/family')
      .then((res) => res.json())
      .then((d) => setFamily(d.group))
      .catch(() => setFamily(null))
  }

  useEffect(() => { loadMedia(folder) }, [folder])
  useEffect(() => { loadFamily() }, [])
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/media-sw.js').catch(() => {})
    }
  }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('folder', folder)
      const res = await fetch('/api/media', { method: 'POST', body: form })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Upload failed')
      loadMedia(folder)
    } catch (err: any) {
      setError(err.message)
    }
    setUploading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this file? This cannot be undone.')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/media/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Delete failed')
      loadMedia(folder)
    } catch (err: any) {
      setError(err.message)
    }
    setBusyId(null)
  }

  async function handleUpgrade(tier: string) {
    setCheckoutBusy(tier)
    setError(null)
    try {
      const res = await fetch('/api/media/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to start checkout')
      window.location.href = d.url
    } catch (err: any) {
      setError(err.message)
      setCheckoutBusy(null)
    }
  }

  async function handleManageBilling() {
    setPortalBusy(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to open billing')
      window.location.href = d.url
    } catch (err: any) {
      setError(err.message)
      setPortalBusy(false)
    }
  }

  async function handleEnableFamily() {
    setFamilyBusy(true)
    setFamilyError(null)
    try {
      const res = await fetch('/api/family', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to enable family sharing')
      loadFamily()
    } catch (err: any) {
      setFamilyError(err.message)
    }
    setFamilyBusy(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setFamilyBusy(true)
    setFamilyError(null)
    try {
      const res = await fetch('/api/family/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to send invite')
      setInviteEmail('')
      loadFamily()
    } catch (err: any) {
      setFamilyError(err.message)
    }
    setFamilyBusy(false)
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm('Remove this member from your family plan?')) return
    setFamilyBusy(true)
    try {
      const res = await fetch('/api/family/remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to remove member')
      loadFamily()
    } catch (err: any) {
      setFamilyError(err.message)
    }
    setFamilyBusy(false)
  }

  async function handleLeaveFamily() {
    if (!confirm('Leave this family plan? You\'ll go back to your own free storage.')) return
    setFamilyBusy(true)
    try {
      const res = await fetch('/api/family/leave', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to leave')
      loadFamily()
      loadMedia(folder)
    } catch (err: any) {
      setFamilyError(err.message)
    }
    setFamilyBusy(false)
  }

  const usedPct = data ? Math.min(100, (data.usedBytes / data.limitBytes) * 100) : 0
  const crumbs = folder ? folder.split('/') : []

  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <a href="/dashboard" className="text-sm text-zinc-400 hover:text-zinc-200">← Dashboard</a>
        <h1 className="text-2xl font-bold mt-2">Media Library</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Your photos and videos, organized into folders — install this page (Add to Home Screen) for quick uploads from your phone.
        </p>

        {/* Usage */}
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-[#131b2a] p-5">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-semibold capitalize">
              {data?.tier ?? '…'} plan {data?.isFamilyMember && <span className="text-xs text-[#f59e0b] ml-1">(family)</span>}
            </span>
            <span className="text-zinc-400">{data ? `${formatBytes(data.usedBytes)} of ${formatBytes(data.limitBytes)} used` : '…'}</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-[#f59e0b]" style={{ width: `${usedPct}%` }} />
          </div>
          <div className="flex items-center gap-4 mt-4">
            <button onClick={() => setShowTiers((s) => !s)} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 font-semibold text-zinc-200">
              {showTiers ? 'Hide plans' : 'Change plan'}
            </button>
            <button onClick={handleManageBilling} disabled={portalBusy} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 font-semibold text-zinc-200 disabled:opacity-50">
              {portalBusy ? 'Opening…' : 'Manage billing'}
            </button>
          </div>

          {showTiers && (
            <div className="grid sm:grid-cols-4 gap-3 mt-4">
              {TIERS.map((t) => (
                <div key={t.key} className={`rounded-xl border p-4 text-center ${data?.tier === t.key ? 'border-[#f59e0b] bg-[#f59e0b]/5' : 'border-zinc-800'}`}>
                  <div className="text-sm font-bold">{t.label}</div>
                  <div className="text-xs text-zinc-400 mt-1">{t.gb} GB</div>
                  <div className="text-lg font-extrabold mt-2">{t.price === 0 ? 'Free' : `$${t.price.toFixed(2)}`}</div>
                  {t.price > 0 && <div className="text-[10px] text-zinc-500">CAD/mo</div>}
                  {data?.tier === t.key ? (
                    <div className="text-[11px] text-[#f59e0b] font-semibold mt-3">Current plan</div>
                  ) : t.key === 'free' ? null : (
                    <button
                      onClick={() => handleUpgrade(t.key)}
                      disabled={checkoutBusy === t.key}
                      className="w-full mt-3 text-xs px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] font-semibold disabled:opacity-50"
                    >
                      {checkoutBusy === t.key ? 'Redirecting…' : 'Upgrade'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Family sharing */}
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-[#131b2a] p-5">
          <h2 className="text-sm font-semibold mb-1">Family Sharing</h2>
          {family === undefined && <p className="text-xs text-zinc-500">Loading…</p>}
          {family === null && (
            <>
              <p className="text-xs text-zinc-400 mb-3">
                Share your storage plan with up to 5 people at no extra cost — everyone keeps their own login, and pulls from the same pooled space. Requires a paid plan.
              </p>
              <button
                onClick={handleEnableFamily}
                disabled={familyBusy || !data || data.tier === 'free'}
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 font-semibold text-zinc-200 disabled:opacity-50"
              >
                {familyBusy ? 'Enabling…' : 'Enable family sharing'}
              </button>
              {data?.tier === 'free' && <p className="text-[11px] text-zinc-500 mt-2">Upgrade to a paid plan above first.</p>}
            </>
          )}
          {family && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-400">{family.members.length} of 5 members</div>
              <div className="space-y-1.5">
                {family.members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm bg-[#0b111c] rounded-lg px-3 py-2">
                    <span>{m.email} {m.id === family.ownerId && <span className="text-[10px] text-[#f59e0b] ml-1">Owner</span>}</span>
                    {family.isOwner && m.id !== family.ownerId && (
                      <button onClick={() => handleRemoveMember(m.id)} className="text-[11px] text-red-400 hover:text-red-300 underline">Remove</button>
                    )}
                  </div>
                ))}
              </div>
              {family.isOwner ? (
                <form onSubmit={handleInvite} className="flex items-center gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Invite by email"
                    className="flex-1 px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
                  />
                  <button type="submit" disabled={familyBusy} className="text-xs px-3 py-2 rounded-lg border border-zinc-700 font-semibold text-zinc-200 disabled:opacity-50">
                    Invite
                  </button>
                </form>
              ) : (
                <button onClick={handleLeaveFamily} disabled={familyBusy} className="text-xs text-red-400 hover:text-red-300 underline">
                  Leave family plan
                </button>
              )}
              {family.invites?.length > 0 && (
                <div className="text-xs text-zinc-500">Pending: {family.invites.map((i) => i.email).join(', ')}</div>
              )}
              {familyError && <p className="text-xs text-red-400">{familyError}</p>}
            </div>
          )}
        </div>

        {/* Files */}
        <div className="mt-6">
          <div className="flex items-center gap-1.5 text-sm flex-wrap">
            <button onClick={() => setFolder('')} className={`hover:text-white ${folder ? 'text-zinc-400' : 'text-white font-semibold'}`}>All Files</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="text-zinc-600">/</span>
                <button onClick={() => setFolder(crumbs.slice(0, i + 1).join('/'))} className={`hover:text-white ${i === crumbs.length - 1 ? 'text-white font-semibold' : 'text-zinc-400'}`}>
                  {c}
                </button>
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <label className="px-4 py-2 rounded-xl border border-zinc-700 text-sm font-semibold cursor-pointer text-zinc-200">
              {uploading ? 'Uploading…' : 'Upload photo or video'}
              <input type="file" accept="image/*,video/*" onChange={handleUpload} disabled={uploading} className="hidden" />
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!newFolderName.trim()) return
                setFolder(folder ? `${folder}/${newFolderName.trim()}` : newFolderName.trim())
                setNewFolderName('')
              }}
              className="flex items-center gap-2"
            >
              <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="New folder" className="px-3 py-2 rounded-xl bg-[#131b2a] border border-zinc-700 text-sm w-40" />
              <button type="submit" className="px-3 py-2 rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-200">Go</button>
            </form>
          </div>

          {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

          {data && data.folders.length > 0 && (
            <div className="grid sm:grid-cols-3 gap-3 mt-5">
              {data.folders.map((f) => (
                <button key={f} onClick={() => setFolder(folder ? `${folder}/${f}` : f)} className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#131b2a] px-4 py-3 text-sm font-semibold hover:border-zinc-600 transition-colors text-left">
                  📁 {f}
                </button>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
            {data?.assets.map((a) => (
              <div key={a.id} className="rounded-xl border border-zinc-800 bg-[#131b2a] p-3 flex flex-col gap-2">
                {a.content_type.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.filename} className="w-full h-32 object-cover rounded-lg bg-black/20" />
                ) : (
                  <video src={a.url} className="w-full h-32 object-cover rounded-lg bg-black/20" controls />
                )}
                <div className="text-xs font-semibold truncate" title={a.filename}>{a.filename}</div>
                <div className="text-[10px] text-zinc-500">{formatBytes(a.size_bytes)}</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => navigator.clipboard.writeText(a.url)} className="text-[11px] text-zinc-400 hover:text-zinc-200 underline">Copy URL</button>
                  <button onClick={() => handleDelete(a.id)} disabled={busyId === a.id} className="text-[11px] text-red-400 hover:text-red-300 underline ml-auto disabled:opacity-50">
                    {busyId === a.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {data && data.assets.length === 0 && data.folders.length === 0 && <p className="text-sm text-zinc-500 mt-5">Nothing here yet.</p>}
        </div>
      </div>
    </main>
  )
}
