'use client'

import { useEffect, useState } from 'react'

type TemplateSummary = {
  id: string
  title: string
  category: string
  description: string
  is_premium: boolean
  price_cents: number
  licenseStatus: 'pending_approval' | 'active' | 'revoked' | null
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: 'Licensed', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  pending_approval: { label: 'Pending approval', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  revoked: { label: 'Revoked', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
}

export default function TemplateGallery() {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/templates')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setTemplates(data.templates)
      })
      .catch((err) => setError(err.message))
  }, [])

  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <a href="/build" className="text-sm text-zinc-400 hover:text-zinc-200">← Back to builder</a>
            <h1 className="text-2xl font-bold mt-2">Premium Templates</h1>
            <p className="text-sm text-zinc-400 mt-1">Full custom designs. Preview freely — purchase a license to edit and export.</p>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {!templates && !error && <p className="text-zinc-500 text-sm">Loading…</p>}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates?.map((t) => {
            const badge = t.licenseStatus ? STATUS_BADGE[t.licenseStatus] : null
            return (
              <a
                key={t.id}
                href={`/build/templates/${t.id}`}
                className="block rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">{t.category}</div>
                  {badge && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.className}`}>{badge.label}</span>
                  )}
                </div>
                <h3 className="text-lg font-semibold mt-2">{t.title}</h3>
                <p className="text-sm text-zinc-400 mt-2">{t.description}</p>
                <div className="mt-4 text-sm font-semibold text-[#f59e0b]">
                  {t.licenseStatus === 'active' ? 'Licensed — open editor' : `$${(t.price_cents / 100).toFixed(2)} one-time license`}
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </main>
  )
}
