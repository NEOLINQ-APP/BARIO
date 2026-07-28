'use client'

import { useEffect, useRef, useState } from 'react'
import { STORAGE_TIERS, STORAGE_TIER_KEYS } from '@/lib/storageTiers'
import {
  generateMek, generateSalt, generateRecoveryCode, wrapMek, unwrapMek,
  encryptFile, decryptToBlob, setUnlockedMek, getUnlockedMek,
} from '@/lib/e2eCrypto'

type Asset = {
  id: string
  folder: string
  filename: string
  url: string
  content_type: string
  size_bytes: number
  created_at: string
  encrypted: boolean
  iv: string | null
}

type E2EStatus = {
  enabled: boolean
  salt: string | null
  wrappedMek: string | null
  wrappedMekIv: string | null
  recoverySalt: string | null
  recoveryWrappedMek: string | null
  recoveryWrappedMekIv: string | null
}

// Lazily fetches + decrypts one encrypted asset's bytes only once the MEK is
// unlocked, and only when it's actually rendered — decrypting every
// encrypted file in a folder up front would be wasteful for anything but a
// handful of thumbnails.
function EncryptedThumb({ asset, unlocked }: { asset: Asset; unlocked: boolean }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let created: string | null = null
    if (!unlocked || !asset.iv) return
    const mek = getUnlockedMek()
    if (!mek) return
    ;(async () => {
      try {
        const res = await fetch(asset.url)
        const ciphertext = await res.arrayBuffer()
        const blob = await decryptToBlob(ciphertext, asset.iv!, mek, asset.content_type)
        if (cancelled) return
        created = URL.createObjectURL(blob)
        setObjectUrl(created)
      } catch {
        if (!cancelled) setError(true)
      }
    })()
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [asset.id, asset.iv, unlocked])

  if (!unlocked) {
    return <div className="w-full h-32 rounded-lg bg-black/20 flex items-center justify-center text-3xl">🔒</div>
  }
  if (error) {
    return <div className="w-full h-32 rounded-lg bg-black/20 flex items-center justify-center text-xs text-red-400 px-2 text-center">Couldn&apos;t decrypt</div>
  }
  if (!objectUrl) {
    return <div className="w-full h-32 rounded-lg bg-black/20 flex items-center justify-center text-xs text-zinc-500">Decrypting…</div>
  }
  if (asset.content_type.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={objectUrl} alt={asset.filename} className="w-full h-32 object-cover rounded-lg bg-black/20" />
  }
  if (asset.content_type.startsWith('video/')) {
    return <video src={objectUrl} className="w-full h-32 object-cover rounded-lg bg-black/20" controls />
  }
  return (
    <a href={objectUrl} download={asset.filename} className="w-full h-32 rounded-lg bg-black/20 flex items-center justify-center text-3xl">
      📄
    </a>
  )
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

  const [e2e, setE2e] = useState<E2EStatus | null>(null)
  const [e2eUnlocked, setE2eUnlocked] = useState(false)
  const [e2eBusy, setE2eBusy] = useState(false)
  const [e2eError, setE2eError] = useState<string | null>(null)
  // Setup wizard: 'idle' (not started) -> 'passphrase' (choosing one) ->
  // 'recovery' (shown once, must confirm saved) -> done (enabled + unlocked)
  const [e2eSetupStep, setE2eSetupStep] = useState<'idle' | 'passphrase' | 'recovery'>('idle')
  const [passphrase1, setPassphrase1] = useState('')
  const [passphrase2, setPassphrase2] = useState('')
  const [pendingRecoveryCode, setPendingRecoveryCode] = useState('')
  const [recoverySavedConfirmed, setRecoverySavedConfirmed] = useState(false)
  const pendingMekRef = useRef<CryptoKey | null>(null)

  const [unlockPassphrase, setUnlockPassphrase] = useState('')
  const [useRecoveryToUnlock, setUseRecoveryToUnlock] = useState(false)
  const [unlockRecoveryCode, setUnlockRecoveryCode] = useState('')

  // Folder-watch auto-upload. There's no way for a website to watch a
  // folder in the background — the File System Access API only works while
  // this tab is open and focused enough to run its interval timer, and the
  // directory handle isn't persisted, so "watching" ends when the tab
  // closes. That's the deliberate scope: a real always-on background sync
  // needs a native app with OS-level permissions, a different project.
  const [watchSupported, setWatchSupported] = useState(false)
  const [watchDirName, setWatchDirName] = useState<string | null>(null)
  const [watchCount, setWatchCount] = useState(0)
  const [watchError, setWatchError] = useState<string | null>(null)
  const watchHandleRef = useRef<any>(null)
  const watchSeenRef = useRef<Set<string>>(new Set())
  const watchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setWatchSupported(typeof window !== 'undefined' && 'showDirectoryPicker' in window)
    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current)
    }
  }, [])

  async function scanWatchedFolder() {
    const dirHandle = watchHandleRef.current
    if (!dirHandle) return
    try {
      for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'file') continue
        const file = await entry.getFile()
        const fingerprint = `${entry.name}:${file.size}:${file.lastModified}`
        if (watchSeenRef.current.has(fingerprint)) continue
        watchSeenRef.current.add(fingerprint)
        if (e2e?.enabled && !getUnlockedMek()) continue // don't silently skip-forever; next scan retries since we haven't marked it uploaded... but we already marked seen above to avoid infinite retry loop on a permanently-locked drive. Simplify: require unlock before watching starts (enforced in handleStartWatch).
        try {
          await uploadOneFile(file, folder)
          setWatchCount((c) => c + 1)
        } catch {
          // leave marked as seen — a persistent per-file error shouldn't retry forever every poll
        }
      }
      loadMedia(folder)
    } catch (err: any) {
      setWatchError(err.message ?? 'Lost access to the watched folder')
    }
  }

  async function handleStartWatch() {
    setWatchError(null)
    if (e2e?.enabled && !e2eUnlocked) {
      setWatchError('Unlock your X-Drive above before watching a folder.')
      return
    }
    try {
      const handle = await (window as any).showDirectoryPicker()
      watchHandleRef.current = handle
      watchSeenRef.current = new Set()
      setWatchDirName(handle.name)
      setWatchCount(0)
      await scanWatchedFolder()
      watchIntervalRef.current = setInterval(scanWatchedFolder, 20_000)
    } catch (err: any) {
      if (err?.name !== 'AbortError') setWatchError(err.message ?? 'Could not access that folder')
    }
  }

  function handleStopWatch() {
    if (watchIntervalRef.current) clearInterval(watchIntervalRef.current)
    watchIntervalRef.current = null
    watchHandleRef.current = null
    watchSeenRef.current = new Set()
    setWatchDirName(null)
  }

  function loadE2eStatus() {
    fetch('/api/media/e2e')
      .then((res) => res.json())
      .then((d) => setE2e(d))
      .catch(() => {})
  }
  useEffect(() => { loadE2eStatus() }, [])

  async function handleStartE2eSetup() {
    setE2eError(null)
    setE2eSetupStep('passphrase')
  }

  async function handleSubmitPassphrase() {
    setE2eError(null)
    if (passphrase1.length < 8) {
      setE2eError('Use at least 8 characters for your passphrase.')
      return
    }
    if (passphrase1 !== passphrase2) {
      setE2eError("Passphrases don't match.")
      return
    }
    const mek = await generateMek()
    pendingMekRef.current = mek
    setPendingRecoveryCode(generateRecoveryCode())
    setE2eSetupStep('recovery')
  }

  async function handleFinishE2eSetup() {
    if (!recoverySavedConfirmed) {
      setE2eError("Confirm you've saved your recovery code — it's the only way back in if you forget your passphrase.")
      return
    }
    const mek = pendingMekRef.current
    if (!mek) return
    setE2eBusy(true)
    setE2eError(null)
    try {
      const salt = generateSalt()
      const recoverySalt = generateSalt()
      const { wrapped: wrappedMek, iv: wrappedMekIv } = await wrapMek(mek, passphrase1, salt)
      const { wrapped: recoveryWrappedMek, iv: recoveryWrappedMekIv } = await wrapMek(mek, pendingRecoveryCode, recoverySalt)

      const res = await fetch('/api/media/e2e', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ salt, wrappedMek, wrappedMekIv, recoverySalt, recoveryWrappedMek, recoveryWrappedMekIv }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to enable encryption')

      setUnlockedMek(mek)
      setE2eUnlocked(true)
      setE2eSetupStep('idle')
      setPassphrase1('')
      setPassphrase2('')
      setPendingRecoveryCode('')
      setRecoverySavedConfirmed(false)
      loadE2eStatus()
    } catch (err: any) {
      setE2eError(err.message)
    }
    setE2eBusy(false)
  }

  async function handleUnlock() {
    if (!e2e?.salt || !e2e.wrappedMek || !e2e.wrappedMekIv) return
    setE2eBusy(true)
    setE2eError(null)
    try {
      const mek = await unwrapMek(e2e.wrappedMek, e2e.wrappedMekIv, unlockPassphrase, e2e.salt)
      setUnlockedMek(mek)
      setE2eUnlocked(true)
      setUnlockPassphrase('')
    } catch {
      setE2eError('Wrong passphrase — try again, or use your recovery code below.')
    }
    setE2eBusy(false)
  }

  async function handleUnlockWithRecovery() {
    if (!e2e?.recoverySalt || !e2e.recoveryWrappedMek || !e2e.recoveryWrappedMekIv) return
    setE2eBusy(true)
    setE2eError(null)
    try {
      const mek = await unwrapMek(e2e.recoveryWrappedMek, e2e.recoveryWrappedMekIv, unlockRecoveryCode.trim().toUpperCase(), e2e.recoverySalt)
      setUnlockedMek(mek)
      setE2eUnlocked(true)
      setUnlockRecoveryCode('')
      setUseRecoveryToUnlock(false)
    } catch {
      setE2eError("That recovery code didn't work — check for typos.")
    }
    setE2eBusy(false)
  }

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

  // Shared by the manual file picker and the folder-watch auto-upload —
  // encrypts client-side first when the drive is unlocked and E2E is on,
  // otherwise uploads the file as-is (unchanged behavior for everyone who
  // hasn't turned encryption on).
  async function uploadOneFile(file: File, targetFolder: string) {
    const form = new FormData()
    form.append('folder', targetFolder)
    const mek = getUnlockedMek()
    if (e2e?.enabled && mek) {
      const { blob, iv } = await encryptFile(file, mek)
      form.append('file', blob, file.name)
      form.append('encrypted', 'true')
      form.append('iv', iv)
      form.append('contentType', file.type || 'application/octet-stream')
    } else {
      form.append('file', file)
    }
    const res = await fetch('/api/media', { method: 'POST', body: form })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error ?? 'Upload failed')
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (e2e?.enabled && !e2eUnlocked) {
      setError('Unlock your X-Drive (enter your passphrase above) before uploading.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      await uploadOneFile(file, folder)
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
        <h1 className="text-2xl font-bold mt-2">X-Drive</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Your photos, videos, and files, organized into folders — install this page (Add to Home Screen) for quick uploads from your phone.
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

        {/* End-to-end encryption */}
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-[#131b2a] p-5">
          <h2 className="text-sm font-semibold mb-1">🔒 End-to-end encryption</h2>

          {e2e === null && <p className="text-xs text-zinc-500">Loading…</p>}

          {e2e && !e2e.enabled && e2eSetupStep === 'idle' && (
            <>
              <p className="text-xs text-zinc-400 mb-3">
                Encrypt your files so only you can read them — not even Bario staff or our servers can see the contents.
                Files you upload after enabling this are protected; existing files aren&apos;t retroactively encrypted.
                <span className="block mt-1 text-amber-400/90">
                  Forgetting both your passphrase and recovery code makes encrypted files permanently unrecoverable — by anyone.
                </span>
              </p>
              <button onClick={handleStartE2eSetup} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 font-semibold text-zinc-200">
                Enable end-to-end encryption
              </button>
            </>
          )}

          {e2eSetupStep === 'passphrase' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">Choose a passphrase. This is separate from your login password and never leaves your device.</p>
              <input
                type="password"
                value={passphrase1}
                onChange={(e) => setPassphrase1(e.target.value)}
                placeholder="New passphrase (min 8 characters)"
                className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
              />
              <input
                type="password"
                value={passphrase2}
                onChange={(e) => setPassphrase2(e.target.value)}
                placeholder="Confirm passphrase"
                className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
              />
              <div className="flex gap-2">
                <button onClick={handleSubmitPassphrase} className="text-xs px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] font-semibold">Continue</button>
                <button onClick={() => { setE2eSetupStep('idle'); setPassphrase1(''); setPassphrase2('') }} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300">Cancel</button>
              </div>
            </div>
          )}

          {e2eSetupStep === 'recovery' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">
                Save this recovery code somewhere safe (password manager, printed and locked away). It&apos;s the <strong>only</strong> way back in if you forget your passphrase — it will not be shown again.
              </p>
              <div className="text-center text-lg font-mono tracking-widest bg-[#0b111c] border border-zinc-700 rounded-lg py-4 select-all">
                {pendingRecoveryCode}
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input type="checkbox" checked={recoverySavedConfirmed} onChange={(e) => setRecoverySavedConfirmed(e.target.checked)} />
                I&apos;ve saved this recovery code somewhere safe
              </label>
              <button onClick={handleFinishE2eSetup} disabled={e2eBusy || !recoverySavedConfirmed} className="text-xs px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] font-semibold disabled:opacity-50">
                {e2eBusy ? 'Enabling…' : 'Finish setup'}
              </button>
            </div>
          )}

          {e2e && e2e.enabled && !e2eUnlocked && e2eSetupStep === 'idle' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">Encryption is on. Unlock your drive to view or upload files this session.</p>
              {!useRecoveryToUnlock ? (
                <>
                  <input
                    type="password"
                    value={unlockPassphrase}
                    onChange={(e) => setUnlockPassphrase(e.target.value)}
                    placeholder="Passphrase"
                    className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
                  />
                  <div className="flex items-center gap-3">
                    <button onClick={handleUnlock} disabled={e2eBusy || !unlockPassphrase} className="text-xs px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] font-semibold disabled:opacity-50">
                      {e2eBusy ? 'Unlocking…' : 'Unlock'}
                    </button>
                    <button onClick={() => setUseRecoveryToUnlock(true)} className="text-xs text-zinc-400 underline">Use recovery code instead</button>
                  </div>
                </>
              ) : (
                <>
                  <input
                    value={unlockRecoveryCode}
                    onChange={(e) => setUnlockRecoveryCode(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                    className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm font-mono"
                  />
                  <div className="flex items-center gap-3">
                    <button onClick={handleUnlockWithRecovery} disabled={e2eBusy || !unlockRecoveryCode} className="text-xs px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] font-semibold disabled:opacity-50">
                      {e2eBusy ? 'Unlocking…' : 'Unlock with recovery code'}
                    </button>
                    <button onClick={() => setUseRecoveryToUnlock(false)} className="text-xs text-zinc-400 underline">Use passphrase instead</button>
                  </div>
                </>
              )}
            </div>
          )}

          {e2e && e2e.enabled && e2eUnlocked && (
            <p className="text-xs text-emerald-400">🔓 Unlocked for this session — new uploads are encrypted automatically.</p>
          )}

          {e2eError && <p className="text-xs text-red-400 mt-2">{e2eError}</p>}
        </div>

        {/* Folder-watch auto-upload */}
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-[#131b2a] p-5">
          <h2 className="text-sm font-semibold mb-1">Auto-upload from a folder</h2>
          {!watchSupported ? (
            <p className="text-xs text-zinc-500">Not supported in this browser — try Chrome or Edge on desktop or Android.</p>
          ) : !watchDirName ? (
            <>
              <p className="text-xs text-zinc-400 mb-3">
                Pick a folder on this device — anything new dropped in it uploads here automatically while this tab stays open (uploads into &ldquo;{folder || 'All Files'}&rdquo;).
                This isn&apos;t background/always-on sync like a phone&apos;s Photos app — it only runs while this page is open.
              </p>
              <button onClick={handleStartWatch} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 font-semibold text-zinc-200">
                Choose folder to watch
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300">📁 Watching <strong>{watchDirName}</strong> — {watchCount} file{watchCount === 1 ? '' : 's'} synced this session</span>
              <button onClick={handleStopWatch} className="text-red-400 hover:text-red-300 underline">Stop</button>
            </div>
          )}
          {watchError && <p className="text-xs text-red-400 mt-2">{watchError}</p>}
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
              {uploading ? 'Uploading…' : 'Upload file'}
              <input
                type="file"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/bario-icon-32.png" alt="" className="w-4 h-4 shrink-0" />
                  {f}
                </button>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
            {data?.assets.map((a) => (
              <div key={a.id} className="rounded-xl border border-zinc-800 bg-[#131b2a] p-3 flex flex-col gap-2">
                {a.encrypted ? (
                  <EncryptedThumb asset={a} unlocked={e2eUnlocked} />
                ) : a.content_type.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.filename} className="w-full h-32 object-cover rounded-lg bg-black/20" />
                ) : a.content_type.startsWith('video/') ? (
                  <video src={a.url} className="w-full h-32 object-cover rounded-lg bg-black/20" controls />
                ) : (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full h-32 rounded-lg bg-black/20 flex items-center justify-center text-3xl"
                  >
                    📄
                  </a>
                )}
                <div className="text-xs font-semibold truncate" title={a.filename}>
                  {a.encrypted && '🔒 '}{a.filename}
                </div>
                <div className="text-[10px] text-zinc-500">{formatBytes(a.size_bytes)}</div>
                <div className="flex items-center gap-2">
                  {!a.encrypted && (
                    <button onClick={() => navigator.clipboard.writeText(a.url)} className="text-[11px] text-zinc-400 hover:text-zinc-200 underline">Copy URL</button>
                  )}
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
