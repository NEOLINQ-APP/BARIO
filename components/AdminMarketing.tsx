'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Platform = 'twitter' | 'facebook' | 'instagram' | 'linkedin' | 'google_business'

// Instagram rides on the Facebook connection (same Meta Page token) — there's
// no separate "Connect Instagram" flow, connecting Facebook resolves both.
const CONNECT_SLUG: Record<Platform, string> = {
  twitter: 'twitter',
  facebook: 'facebook',
  instagram: 'facebook',
  linkedin: 'linkedin',
  google_business: 'google',
}

type Post = {
  id: string
  platform: Platform
  content: string
  status: 'draft' | 'approved' | 'posted' | 'failed' | 'rejected'
  error: string | null
  created_at: string
  posted_at: string | null
}

const PLATFORM_LABELS: Record<Platform, string> = {
  twitter: 'X (Twitter)',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  google_business: 'Google Business Profile',
}

const ALL_PLATFORMS = Object.keys(PLATFORM_LABELS) as Platform[]

const STATUS_COLOR: Record<Post['status'], string> = {
  draft: 'text-slate-500 dark:text-zinc-400',
  approved: 'text-amber-600 dark:text-amber-400',
  posted: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-red-600 dark:text-red-400',
  rejected: 'text-slate-400 dark:text-zinc-600',
}

export default function AdminMarketing() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [connected, setConnected] = useState<Record<Platform, boolean>>({} as any)
  const [appConfigured, setAppConfigured] = useState<Record<Platform, boolean>>({} as any)
  const [banner, setBanner] = useState<{ text: string; ok: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const [topic, setTopic] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(ALL_PLATFORMS)

  function load() {
    fetch('/api/admin/marketing')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setPosts(data.posts)
        setConnected(data.connected)
        setAppConfigured(data.appConfigured)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    load()
    // The OAuth callbacks redirect back here with ?connected=<platform> or
    // ?error=<message> — surface that once, then clean the URL so a refresh
    // doesn't re-show a stale result.
    const params = new URLSearchParams(window.location.search)
    const connectedPlatform = params.get('connected')
    const oauthError = params.get('error')
    if (connectedPlatform) setBanner({ text: `${PLATFORM_LABELS[connectedPlatform as Platform] ?? connectedPlatform} connected.`, ok: true })
    else if (oauthError) setBanner({ text: oauthError, ok: false })
    if (connectedPlatform || oauthError) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/marketing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platforms: selectedPlatforms, topic }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate drafts')
      load()
    } catch (err: any) {
      setError(err.message)
    }
    setGenerating(false)
  }

  async function handleApprove(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/marketing/${id}/approve`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to publish')
      load()
    } catch (err: any) {
      setError(err.message)
      load()
    }
    setBusyId(null)
  }

  async function handleReject(id: string) {
    setBusyId(id)
    await fetch(`/api/admin/marketing/${id}/reject`, { method: 'POST' })
    load()
    setBusyId(null)
  }

  async function handleDelete(id: string) {
    setBusyId(id)
    await fetch(`/api/admin/marketing/${id}`, { method: 'DELETE' })
    load()
    setBusyId(null)
  }

  function startEdit(post: Post) {
    setEditingId(post.id)
    setEditContent(post.content)
  }

  async function saveEdit(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/marketing/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setEditingId(null)
      load()
    } catch (err: any) {
      setError(err.message)
    }
    setBusyId(null)
  }

  function togglePlatform(p: Platform) {
    setSelectedPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <a href="/admin" className="text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200">← Admin</a>
          <ThemeToggle />
        </div>
        <h1 className="text-2xl font-bold mt-2">Marketing Posts</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          AI drafts posts for review — nothing goes out until you click Approve, which publishes immediately.
        </p>

        {banner && (
          <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${banner.ok ? 'border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400' : 'border-red-300 dark:border-red-800 text-red-600 dark:text-red-400'}`}>
            {banner.text}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {ALL_PLATFORMS.map((p) => (
            <div
              key={p}
              className={`flex items-center gap-2 px-2 py-1 rounded-md border ${connected[p] ? 'border-emerald-300 dark:border-emerald-800' : 'border-slate-200 dark:border-zinc-800'}`}
            >
              <span className={connected[p] ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-500'}>
                {PLATFORM_LABELS[p]} {connected[p] ? '· connected' : ''}
              </span>
              {!connected[p] && (
                appConfigured[p] ? (
                  <a href={`/api/admin/marketing/connect/${CONNECT_SLUG[p]}`} className="text-[#f59e0b] underline">
                    Connect
                  </a>
                ) : (
                  <span className="text-slate-400 dark:text-zinc-600">not set up yet</span>
                )
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleGenerate} className="mt-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 space-y-3">
          <h2 className="text-sm font-semibold">Generate new drafts</h2>
          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">What should this batch be about? (blank = general promotion)</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. our new custom domain feature"
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {ALL_PLATFORMS.map((p) => (
              <label key={p} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-300">
                <input type="checkbox" checked={selectedPlatforms.includes(p)} onChange={() => togglePlatform(p)} />
                {PLATFORM_LABELS[p]}
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={generating || !selectedPlatforms.length} className="px-4 py-2 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold disabled:opacity-50">
            {generating ? 'Generating…' : 'Generate drafts'}
          </button>
        </form>

        <div className="mt-8 space-y-3">
          {posts?.length === 0 && <p className="text-slate-500 dark:text-zinc-500 text-sm">No posts yet — generate a batch above.</p>}
          {posts?.map((post) => (
            <div key={post.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-xs text-slate-500 dark:text-zinc-400">
                  {PLATFORM_LABELS[post.platform]} · <span className={STATUS_COLOR[post.status]}>{post.status}</span>
                  {!connected[post.platform] && post.status === 'draft' && (
                    <span className="text-amber-600 dark:text-amber-500"> · not connected yet</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-zinc-600">{new Date(post.created_at).toLocaleString()}</div>
              </div>

              {editingId === post.id ? (
                <div className="mt-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => saveEdit(post.id)} disabled={busyId === post.id} className="px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-700 dark:text-zinc-200 mt-2 whitespace-pre-wrap">{post.content}</p>
              )}

              {post.error && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{post.error}</p>}

              {post.status === 'draft' && editingId !== post.id && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => handleApprove(post.id)} disabled={busyId === post.id} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">
                    {busyId === post.id ? 'Posting…' : 'Approve & Post'}
                  </button>
                  <button onClick={() => startEdit(post)} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs">
                    Edit
                  </button>
                  <button onClick={() => handleReject(post.id)} disabled={busyId === post.id} className="px-3 py-1.5 rounded-lg border border-red-400 dark:border-red-500/40 text-red-600 dark:text-red-400 text-xs">
                    Reject
                  </button>
                </div>
              )}

              {(post.status === 'failed' || post.status === 'rejected') && (
                <div className="flex gap-2 mt-3">
                  {post.status === 'failed' && (
                    <button onClick={() => handleApprove(post.id)} disabled={busyId === post.id} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">
                      Retry
                    </button>
                  )}
                  <button onClick={() => handleDelete(post.id)} disabled={busyId === post.id} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs text-slate-500 dark:text-zinc-400">
                    Discard
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
