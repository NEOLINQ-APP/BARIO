'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type TemplateDetail = {
  id: string
  title: string
  category: string
  description: string
  html: string
  is_premium: boolean
  price_cents: number
  unlocked: boolean
}

export default function TemplateViewer({ templateId, siteId }: { templateId: string; siteId: string | null }) {
  const [template, setTemplate] = useState<TemplateDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [usingTemplate, setUsingTemplate] = useState(false)
  const [buying, setBuying] = useState(false)
  const [needsPurchase, setNeedsPurchase] = useState(false)
  const justPurchased = useSearchParams().get('purchased') === '1'
  const [confirmingPurchase, setConfirmingPurchase] = useState(justPurchased)

  useEffect(() => {
    // Coming back from a successful Stripe checkout — the webhook that
    // records the license usually lands within a second or two, but can
    // trail the redirect. Poll briefly rather than immediately telling a
    // customer who just paid that they still need to buy it.
    let attempts = 0
    let cancelled = false
    function load() {
      fetch(`/api/templates/${templateId}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return
          if (data.error) throw new Error(data.error)
          setTemplate(data)
          const stillLocked = data.is_premium && !data.unlocked
          setNeedsPurchase(stillLocked)
          if (justPurchased && stillLocked && attempts < 5) {
            attempts += 1
            setTimeout(load, 1500)
          } else {
            setConfirmingPurchase(false)
          }
        })
        .catch((err) => !cancelled && setLoadError(err.message))
    }
    load()
    return () => { cancelled = true }
  }, [templateId, justPurchased])

  function handleExport() {
    window.location.href = `/api/templates/${templateId}/export`
  }

  function handleFullPreview() {
    if (!template) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.open()
    win.document.write(template.html)
    win.document.close()
  }

  async function handleUseTemplate() {
    setUsingTemplate(true)
    setActionError(null)
    try {
      const res = await fetch('/api/sites/use-template', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId, siteId }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.premium) setNeedsPurchase(true)
        throw new Error(data.error ?? 'Failed to use template')
      }
      window.location.href = `/build${siteId ? `?site=${siteId}` : ''}`
    } catch (err: any) {
      setActionError(err.message)
      setUsingTemplate(false)
    }
  }

  async function handleBuyTemplate() {
    setBuying(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/templates/${templateId}/purchase`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start checkout')
      window.location.href = data.url
    } catch (err: any) {
      setActionError(err.message)
      setBuying(false)
    }
  }

  if (loadError) return <main className="min-h-screen bg-[#0b111c] text-red-400 p-10">{loadError}</main>
  if (!template) return <main className="min-h-screen bg-[#0b111c] text-zinc-400 p-10">Loading…</main>

  return (
    <main className="h-screen flex flex-col bg-[#0b111c] text-zinc-100">
      <div className="flex items-center gap-4 h-14 px-5 border-b border-zinc-800 flex-shrink-0">
        <a href={`/build/templates${siteId ? `?site=${siteId}` : ''}`} className="text-sm text-zinc-400 hover:text-zinc-200">← Templates</a>
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">{template.title}</div>
            {template.is_premium && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${needsPurchase ? 'bg-[#f59e0b]/10 text-[#f59e0b]' : 'bg-emerald-500/10 text-emerald-400'}`}>
                {needsPurchase ? `$${(template.price_cents / 100).toFixed(0)}` : 'Unlocked'}
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500">{template.category}</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {actionError && <span className="text-xs text-red-400 max-w-xs text-right">{actionError}</span>}
          <button onClick={handleFullPreview} className="px-4 py-1.5 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-200">
            Open Full Preview ↗
          </button>
          <button onClick={handleExport} className="px-4 py-1.5 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-200">
            Export HTML
          </button>
          {needsPurchase && (
            <button onClick={handleBuyTemplate} disabled={buying} className="px-4 py-1.5 rounded-lg border border-[#f59e0b] text-[#f59e0b] text-xs font-semibold disabled:opacity-60">
              {buying ? 'Redirecting…' : `Buy for $${(template.price_cents / 100).toFixed(0)}`}
            </button>
          )}
          <button onClick={handleUseTemplate} disabled={usingTemplate} className="px-4 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold disabled:opacity-60">
            {usingTemplate ? 'Loading…' : 'Use This Template'}
          </button>
        </div>
      </div>

      <div className="bg-blue-500/10 border-b border-blue-500/20 text-blue-300 text-xs px-5 py-2">
        This is a live preview — nothing is saved yet.
        {confirmingPurchase
          ? ` Confirming your purchase…`
          : needsPurchase
          ? ` This is a premium template — upgrade to a paid plan or buy it individually to use it on your site.`
          : ` Click "Use This Template" to start editing and publishing it as your site.`}
      </div>

      <iframe srcDoc={template.html} className="flex-1 w-full bg-white" title={template.title} />
    </main>
  )
}
