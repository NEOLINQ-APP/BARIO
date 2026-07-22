'use client'

import { useEffect, useState } from 'react'

type Platform = 'twitter' | 'facebook' | 'instagram' | 'linkedin' | 'google_business'

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
  draft: 'text-zinc-400',
  approved: 'text-amber-400',
  posted: 'text-emerald-400',
  failed: 'text-red-400',
  rejected: 'text-zinc-600',
}

export default function AdminMarketing() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [connected, setConnected] = useState<Record<Platform, boolean>>({} as any)
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
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    load()
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
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <a href="/admin" className="text-sm text-zinc-400 hover:text-zinc-200">← Admin</a>
        <h1 className="text-2xl font-bold mt-2">Marketing Posts</h1>
        <p className="text-sm text-zinc-400 mt-1">
          AI drafts posts for review — nothing goes out until you click Approve, which publishes immediately.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {ALL_PLATFORMS.map((p) => (
            <span
              key={p}
              className={`px-2 py-1 rounded-md border ${connected[p] ? 'border-emerald-800 text-emerald-400' : 'border-zinc-800 text-zinc-500'}`}
            >
              {PLATFORM_LABELS[p]} {connected[p] ? '· connected' : '· not connected'}
            </span>
          ))}
        </div>

        <form onSubmit={handleGenerate} className="mt-6 rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 space-y-3">
          <h2 className="text-sm font-semibold">Generate new drafts</h2>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">What should this batch be about? (blank = general promotion)</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. our new custom domain feature"
              className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {ALL_PLATFORMS.map((p) => (
              <label key={p} className="flex items-center gap-1.5 text-xs text-zinc-300">
                <input type="checkbox" checked={selectedPlatforms.includes(p)} onChange={() => togglePlatform(p)} />
                {PLATFORM_LABELS[p]}
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={generating || !selectedPlatforms.length} className="px-4 py-2 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold disabled:opacity-50">
            {generating ? 'Generating…' : 'Generate drafts'}
          </button>
        </form>

        <div className="mt-8 space-y-3">
          {posts?.length === 0 && <p className="text-zinc-500 text-sm">No posts yet — generate a batch above.</p>}
          {posts?.map((post) => (
            <div key={post.id} className="rounded-xl border border-zinc-800 bg-[#131b2a] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-xs text-zinc-400">
                  {PLATFORM_LABELS[post.platform]} · <span className={STATUS_COLOR[post.status]}>{post.status}</span>
                  {!connected[post.platform] && post.status === 'draft' && (
                    <span className="text-amber-500"> · not connected yet</span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-600">{new Date(post.created_at).toLocaleString()}</div>
              </div>

              {editingId === post.id ? (
                <div className="mt-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => saveEdit(post.id)} disabled={busyId === post.id} className="px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-200 mt-2 whitespace-pre-wrap">{post.content}</p>
              )}

              {post.error && <p className="text-xs text-red-400 mt-2">{post.error}</p>}

              {post.status === 'draft' && editingId !== post.id && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => handleApprove(post.id)} disabled={busyId === post.id} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">
                    {busyId === post.id ? 'Posting…' : 'Approve & Post'}
                  </button>
                  <button onClick={() => startEdit(post)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs">
                    Edit
                  </button>
                  <button onClick={() => handleReject(post.id)} disabled={busyId === post.id} className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 text-xs">
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
                  <button onClick={() => handleDelete(post.id)} disabled={busyId === post.id} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-400">
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
