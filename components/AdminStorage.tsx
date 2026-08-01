'use client'

import { useEffect, useRef, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Asset = {
  id: string
  folder: string
  filename: string
  url: string
  content_type: string
  size_bytes: number
  created_at: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AdminStorage() {
  const [folder, setFolder] = useState('')
  const [folders, setFolders] = useState<string[]>([])
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function load(f: string) {
    setAssets(null)
    setError(null)
    fetch(`/api/admin/storage?folder=${encodeURIComponent(f)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setFolders(data.folders)
        setAssets(data.assets)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => { load(folder) }, [folder])

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
      const res = await fetch('/api/admin/storage', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      load(folder)
    } catch (err: any) {
      setError(err.message)
    }
    setUploading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this file? This cannot be undone.')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/storage/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Delete failed')
      load(folder)
    } catch (err: any) {
      setError(err.message)
    }
    setBusyId(null)
  }

  function goToFolder(newFolder: string) {
    setFolder(newFolder.replace(/^\/+|\/+$/g, ''))
  }

  const crumbs = folder ? folder.split('/') : []

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <a href="/admin" className="text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200">← Admin</a>
          <ThemeToggle />
        </div>
        <h1 className="text-2xl font-bold mt-2">Storage</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          Shared file storage for builds, templates, and media — organized into folders. Also reachable via the API with an admin key.
        </p>

        <div className="flex items-center gap-1.5 mt-6 text-sm flex-wrap">
          <button onClick={() => goToFolder('')} className={`hover:text-slate-900 dark:hover:text-white ${folder ? 'text-slate-500 dark:text-zinc-400' : 'text-slate-900 dark:text-white font-semibold'}`}>Root</button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="text-slate-400 dark:text-zinc-600">/</span>
              <button
                onClick={() => goToFolder(crumbs.slice(0, i + 1).join('/'))}
                className={`hover:text-slate-900 dark:hover:text-white ${i === crumbs.length - 1 ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-500 dark:text-zinc-400'}`}
              >
                {c}
              </button>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <label className="px-4 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-sm font-semibold cursor-pointer text-slate-700 dark:text-zinc-200">
            {uploading ? 'Uploading…' : 'Upload file'}
            <input ref={fileInputRef} type="file" onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!newFolderName.trim()) return
              goToFolder(folder ? `${folder}/${newFolderName.trim()}` : newFolderName.trim())
              setNewFolderName('')
            }}
            className="flex items-center gap-2"
          >
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder name"
              className="px-3 py-2 rounded-xl bg-white dark:bg-[#131b2a] border border-slate-300 dark:border-zinc-700 text-sm w-48"
            />
            <button type="submit" className="px-3 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-sm font-semibold text-slate-700 dark:text-zinc-200">Go</button>
          </form>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">Folders appear once they contain at least one file — upload after navigating into a new one.</p>

        {error && <p className="text-sm text-red-500 dark:text-red-400 mt-4">{error}</p>}

        {folders.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-500 mb-3">Folders</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {folders.map((f) => (
                <button
                  key={f}
                  onClick={() => goToFolder(folder ? `${folder}/${f}` : f)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] px-4 py-3 text-sm font-semibold hover:border-slate-300 dark:hover:border-zinc-600 transition-colors text-left"
                >
                  📁 {f}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-500 mb-3">Files</h2>
          {!assets && <p className="text-sm text-slate-500 dark:text-zinc-500">Loading…</p>}
          {assets?.length === 0 && folders.length === 0 && <p className="text-sm text-slate-500 dark:text-zinc-500">Nothing here yet.</p>}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assets?.map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-3 flex flex-col gap-2">
                {a.content_type.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.filename} className="w-full h-32 object-cover rounded-lg bg-black/10 dark:bg-black/20" />
                ) : (
                  <div className="w-full h-32 rounded-lg bg-black/10 dark:bg-black/20 flex items-center justify-center text-3xl">
                    {a.content_type.startsWith('video/') ? '🎬' : a.content_type.startsWith('audio/') ? '🎵' : '📄'}
                  </div>
                )}
                <div className="text-xs font-semibold truncate" title={a.filename}>{a.filename}</div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-500">{formatSize(a.size_bytes)}</div>
                <div className="flex items-center gap-2">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#f59e0b] underline">Open</a>
                  <button
                    onClick={() => navigator.clipboard.writeText(a.url)}
                    className="text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 underline"
                  >
                    Copy URL
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={busyId === a.id}
                    className="text-[11px] text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 underline ml-auto disabled:opacity-50"
                  >
                    {busyId === a.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
